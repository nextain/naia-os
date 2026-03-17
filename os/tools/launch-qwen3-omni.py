#!/usr/bin/env python3
"""
Launch Qwen3-Omni vLLM server on Vertex AI Custom Job (A100, preemptible).
Exposes OpenAI-compatible API via cloudflared tunnel.

Usage:
  python launch-qwen3-omni.py          # Submit job
  python launch-qwen3-omni.py --logs   # Tail logs of running job
  python launch-qwen3-omni.py --stop   # Cancel running job
"""
import sys
import time
import re
from google.cloud import aiplatform

PROJECT = "project-a8b18af5-b980-43e7-8ec"
REGION = "us-central1"
MODEL_ID = "cyankiwi/Qwen3-Omni-30B-A3B-Instruct-AWQ-4bit"
JOB_NAME = "qwen3-omni-vllm"

STARTUP_SCRIPT = f"""
set -e

echo "=== Starting Qwen3-Omni vLLM Server ==="
echo "Model: {MODEL_ID}"

# Start vLLM in background
vllm serve {MODEL_ID} \
  --omni \
  --port 8091 \
  --max-model-len 2048 \
  --gpu-memory-utilization 0.95 \
  --max-num-seqs 1 \
  --dtype float16 \
  --trust-remote-code \
  > /tmp/vllm.log 2>&1 &

VLLM_PID=$!
echo "vLLM PID: $VLLM_PID"

# Install cloudflared
echo "Installing cloudflared..."
apt-get update -qq && apt-get install -qq -y wget > /dev/null 2>&1 || true
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
  -O /usr/local/bin/cloudflared
chmod +x /usr/local/bin/cloudflared

# Wait for vLLM to be ready (model download + load)
echo "Waiting for vLLM server..."
for i in $(seq 1 180); do
  if curl -s http://localhost:8091/health > /dev/null 2>&1; then
    echo "=== vLLM server ready! (took ${{i}}0s) ==="
    break
  fi
  if ! kill -0 $VLLM_PID 2>/dev/null; then
    echo "=== vLLM CRASHED ==="
    cat /tmp/vllm.log
    exit 1
  fi
  sleep 10
done

# Start cloudflared tunnel
echo "Starting cloudflared tunnel..."
cloudflared tunnel --url http://localhost:8091 > /tmp/tunnel.log 2>&1 &
sleep 8

TUNNEL_URL=$(grep -oP 'https://[\\w-]+\\.trycloudflare\\.com' /tmp/tunnel.log | head -1)

echo ""
echo "============================================"
echo "  TUNNEL URL: $TUNNEL_URL"
echo "  API:        $TUNNEL_URL/v1/chat/completions"
echo "============================================"
echo ""
echo "=== READY FOR REQUESTS ==="

# Keep alive — logs heartbeat every 5 min
while kill -0 $VLLM_PID 2>/dev/null; do
  echo "[heartbeat] $(date -Iseconds) vLLM running, tunnel: $TUNNEL_URL"
  sleep 300
done

echo "vLLM process exited."
cat /tmp/vllm.log
"""


def find_running_job():
    """Find existing running job."""
    jobs = aiplatform.CustomJob.list(
        filter=f'display_name="{JOB_NAME}"',
        order_by="create_time desc",
    )
    for job in jobs:
        if job.state.name in ("JOB_STATE_RUNNING", "JOB_STATE_PENDING", "JOB_STATE_QUEUED"):
            return job
    return None


def submit_job():
    """Submit the custom job."""
    existing = find_running_job()
    if existing:
        print(f"Job already running: {existing.resource_name}")
        print(f"State: {existing.state.name}")
        print("Use --logs to check, or --stop to cancel.")
        return existing

    from google.cloud.aiplatform_v1.types import custom_job as custom_job_v1

    job = aiplatform.CustomJob(
        display_name=JOB_NAME,
        worker_pool_specs=[{
            "machine_spec": {
                "machine_type": "a2-highgpu-1g",
                "accelerator_type": "NVIDIA_TESLA_A100",
                "accelerator_count": 1,
            },
            "replica_count": 1,
            "container_spec": {
                "image_uri": "vllm/vllm-omni:v0.16.0",
                "command": ["bash", "-c"],
                "args": [STARTUP_SCRIPT],
            },
        }],
    )
    # Use SPOT scheduling to use preemptible quota
    job._gca_resource.job_spec.scheduling = custom_job_v1.Scheduling(
        strategy=custom_job_v1.Scheduling.Strategy.SPOT,
        restart_job_on_worker_restart=False,
    )

    print("Submitting Vertex AI Custom Job...")
    print(f"  Machine: a2-highgpu-1g + A100 (preemptible)")
    print(f"  Model: {MODEL_ID}")
    print(f"  Region: {REGION}")

    job.submit(
        enable_web_access=True,
        service_account=None,
    )

    print(f"\nJob submitted: {job.resource_name}")
    print(f"State: {job.state.name}")
    print("\nWaiting for tunnel URL... (this takes ~5-15 min for model download)")
    print("Run with --logs to check progress.")

    # Poll logs for tunnel URL
    for i in range(60):
        time.sleep(30)
        try:
            job.refresh()
            state = job.state.name
            print(f"  [{i*30}s] State: {state}")
            if state in ("JOB_STATE_FAILED", "JOB_STATE_CANCELLED"):
                print("Job failed. Check logs with --logs")
                return job
        except Exception:
            pass

    return job


def tail_logs():
    """Show logs from the running job."""
    import subprocess
    job = find_running_job()
    if not job:
        print("No running job found.")
        return

    job_id = job.resource_name.split("/")[-1]
    print(f"Job: {job.resource_name} ({job.state.name})")
    print("Fetching logs...\n")

    subprocess.run([
        "gcloud", "ai", "custom-jobs", "stream-logs", job_id,
        f"--region={REGION}",
        f"--project={PROJECT}",
    ])


def stop_job():
    """Cancel the running job."""
    job = find_running_job()
    if not job:
        print("No running job found.")
        return
    print(f"Cancelling: {job.resource_name}")
    job.cancel()
    print("Cancelled.")


if __name__ == "__main__":
    aiplatform.init(
        project=PROJECT,
        location=REGION,
        staging_bucket="gs://project-a8b18af5-b980-43e7-8ec_cloudbuild",
    )

    if "--logs" in sys.argv:
        tail_logs()
    elif "--stop" in sys.argv:
        stop_job()
    else:
        submit_job()
