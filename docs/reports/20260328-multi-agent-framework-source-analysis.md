# Multi-Agent Framework Source Code Analysis
## Research Agent 5 — Deep Implementation Review
### Date: 2026-03-28

---

## Executive Summary

This report presents a **source-code-level analysis** of three leading multi-agent frameworks: AutoGen (Microsoft), CrewAI, and MetaGPT. Rather than relying on documentation or marketing material, every finding here is derived from reading the actual Python implementations. The goal is to identify architectural patterns, coordination mechanisms, fault handling strategies, and — critically — the **gaps** that none of these frameworks address but that our design requires.

---

## 1. AutoGen v0.4 (microsoft/autogen)

### 1.1 Architecture Overview

AutoGen v0.4 represents a complete rewrite from v0.2. The core shift is from a synchronous conversation loop to an **event-driven, topic-based pub-sub architecture** built on an `AgentRuntime`.

```
┌─────────────────────────────────────────────────┐
│                  AgentRuntime                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐   │
│  │  Agent A   │  │  Agent B   │  │  Agent C   │   │
│  │(Container) │  │(Container) │  │(Container) │   │
│  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘   │
│        │               │               │         │
│  ┌─────▼───────────────▼───────────────▼─────┐   │
│  │         Topic-Based Message Bus            │   │
│  │  (group_topic, output_topic, per-agent)    │   │
│  └─────────────────┬─────────────────────────┘   │
│                    │                              │
│  ┌─────────────────▼─────────────────────────┐   │
│  │      BaseGroupChatManager                  │   │
│  │  - select_speaker() [abstract]             │   │
│  │  - handle_agent_response()                 │   │
│  │  - _apply_termination_condition()          │   │
│  │  - _transition_to_next_speakers()          │   │
│  └────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### 1.2 Speaker Selection — The Core Coordination Mechanism

AutoGen v0.4 provides **four distinct speaker selection strategies**, each implemented as a subclass of `BaseGroupChatManager`:

#### a) RoundRobinGroupChat
```python
async def select_speaker(self, thread):
    current_speaker_index = self._next_speaker_index
    self._next_speaker_index = (current_speaker_index + 1) % len(self._participant_names)
    return self._participant_names[current_speaker_index]
```
**Analysis**: Simplest strategy. Deterministic, no LLM calls. Index wraps via modulo. State persisted as `_next_speaker_index`.

#### b) SelectorGroupChat (LLM-based selection)
```python
# Default prompt template:
"""You are in a role play game. The following roles are available:
{roles}.
Read the following conversation. Then select the next role
from {participants} to play. Only return the role."""

# Candidate filtering:
if self._candidate_func is not None:
    participants = await async_candidate_func(thread)
elif self._previous_speaker is not None and not self._allow_repeated_speaker:
    participants = [p for p in self._participant_names if p != self._previous_speaker]

# Fallback on selection failure:
if self._previous_speaker is not None:
    return self._previous_speaker
return participants[0]
```
**Analysis**: Uses an LLM to read conversation history and pick next speaker. Supports custom `candidate_func` for programmatic filtering. Has retry logic but **no consensus mechanism** — single LLM decides. Fallback is simplistic (previous speaker or first participant).

#### c) SwarmGroupChat (Handoff-based)
```python
async def select_speaker(self, thread):
    for message in reversed(thread):
        if isinstance(message, HandoffMessage):
            self._current_speaker = message.target
            return [self._current_speaker]
    return self._current_speaker
```
**Analysis**: Agents explicitly hand off to each other via `HandoffMessage`. No centralized decision. Agent-initiated transitions. Most similar to real-world human handoffs.

#### d) MagenticOneOrchestrator (Ledger-based planning)
```python
# Two-loop architecture:
# Outer loop: Create/update task ledger (facts + plan)
# Inner loop: Execute steps, select speakers via JSON ledger

progress_ledger = extract_json_from_str(ledger_str)
# Keys: is_request_satisfied, is_progress_being_made,
#        is_in_loop, instruction_or_question, next_speaker

# Stall detection:
if not progress_ledger["is_progress_being_made"]:
    self._n_stalls += 1
if self._n_stalls > max_stalls:
    await self._update_task_ledger()  # Replan
```
**Analysis**: Most sophisticated. Maintains explicit task facts and plans. Detects stalls and loops. Replans when progress stalls. **This is the closest to what our design needs** — but it's orchestrator-centric, not peer-based.

### 1.3 Message Routing

AutoGen v0.4 uses **topic-based pub-sub**:
- Each participant gets its own topic type
- A shared `group_topic` broadcasts to all
- An `output_topic` sends results to the caller
- Manager publishes `GroupChatRequestPublish` to selected speaker's topic

```python
async def _transition_to_next_speakers(self, cancellation_token):
    speaker_names = await self.select_speaker(self._message_thread)
    for speaker_name in speaker_names:
        speaker_topic_type = self._participant_name_to_topic_type[speaker_name]
        await self.publish_message(
            GroupChatRequestPublish(),
            topic_id=DefaultTopicId(type=speaker_topic_type),
            cancellation_token=cancellation_token,
        )
        self._active_speakers.append(speaker_name)
```

**Key insight**: Supports **parallel speaker activation** — multiple agents can be active simultaneously (`_active_speakers` is a list). The manager waits for all active speakers to respond before selecting next.

### 1.4 Termination Conditions

AutoGen provides composable termination:
- `TextMentionTermination` — stops when specific text appears
- `MaxMessageTermination` — stops after N messages
- `HandoffTermination` — stops on handoff to specific target
- `StopMessage` — explicit stop signal
- `max_turns` parameter on all group chats

```python
async def _apply_termination_condition(self, delta, increment_turn_count=False):
    if self._termination_condition is not None:
        stop_message = await self._termination_condition(delta)
        if stop_message is not None:
            await self._termination_condition.reset()
            self._current_turn = 0
            await self._signal_termination(stop_message)
            return True
    if increment_turn_count:
        self._current_turn += 1
        if self._max_turns and self._current_turn >= self._max_turns:
            # Force stop
```

### 1.5 Error Handling

```python
async def handle_agent_response(self, message, ctx):
    try:
        # ... process response, check termination, select next speaker
    except Exception as e:
        error = SerializableException.from_exception(e)
        await self._signal_termination_with_error(error)
        raise
```

**Analysis**: Exceptions are caught, serialized, and propagated as termination signals. **No retry logic at the manager level** — if an agent fails, the entire group chat terminates with an error. The MagenticOne orchestrator is the exception, with JSON retry logic (`max_json_retries = 10`).

### 1.6 State Management

Full serialization support:
```python
async def save_state(self):
    state = {name: await agent.save_state() for name, agent in agents}
    return state

async def load_state(self, state):
    for name, agent_state in state.items():
        await agent.load_state(agent_state)
```

---

## 2. CrewAI (crewAIInc/crewAI)

### 2.1 Architecture Overview

CrewAI uses a **process-based orchestration** model with two modes:

```
┌──────────────────────────────────────────────────┐
│                    Crew                            │
│  process: Sequential | Hierarchical               │
│                                                    │
│  Sequential:                                       │
│  Task1 ──► Task2 ──► Task3 ──► CrewOutput         │
│  (AgentA)  (AgentB)  (AgentC)                     │
│                                                    │
│  Hierarchical:                                     │
│  ┌──────────────┐                                  │
│  │ Manager Agent │ ◄── manager_llm / manager_agent │
│  └──────┬───────┘                                  │
│         │ delegates                                │
│    ┌────▼────┐  ┌────────┐  ┌────────┐           │
│    │ AgentA  │  │ AgentB │  │ AgentC │           │
│    └─────────┘  └────────┘  └────────┘           │
└──────────────────────────────────────────────────┘
```

### 2.2 Execution Flow

```python
# kickoff() routes based on process type:
def kickoff(self, inputs=None):
    # 1. Run before_kickoff_callbacks on inputs
    # 2. Interpolate inputs into agent/task templates
    # 3. Route to process handler
    if self.process == Process.sequential:
        result = self._run_sequential_process()
    elif self.process == Process.hierarchical:
        result = self._run_hierarchical_process()
    # 4. Run after_kickoff_callbacks on output
    # 5. Return CrewOutput

# Sequential: just delegates to _execute_tasks()
def _run_sequential_process(self):
    return self._execute_tasks(self.tasks)

# Hierarchical: creates manager, then executes
def _run_hierarchical_process(self):
    manager = self._create_manager_agent()  # if not provided
    return self._execute_tasks(self.tasks, manager=manager)
```

### 2.3 Task Execution Core

```python
def _execute_core(self, agent, context, tools):
    # 1. Emit TaskStartedEvent
    # 2. Call agent.execute_task(task, context, tools)
    # 3. Export output to structured format (Pydantic/JSON)
    # 4. Run guardrails validation loop
    # 5. Execute callbacks
    # 6. Save output file if configured
    # 7. Emit TaskCompletedEvent
```

### 2.4 Output Validation — Guardrails

CrewAI's most distinctive feature is its **guardrail system**:

```python
# Guardrail retry loop in _execute_core():
for attempt in range(guardrail_max_retries):
    result = agent.execute_task(task, context, tools)
    guardrail_result = process_guardrail(result)
    if guardrail_result.success:
        break
    else:
        # Feed validation error back to agent for retry
        context += f"\nValidation error: {guardrail_result.error}"
        result = agent.execute_task(task, context, tools)

# If max retries exceeded:
raise Exception(f"Guardrail failed after {attempts} attempts: {last_error}")
```

**Types of guardrails**:
- `LLMGuardrail` — LLM-based hallucination detection
- Custom `output_pydantic` / `output_json` schema validation
- User-defined guardrail functions

### 2.5 Error Handling

```python
# Task-level:
try:
    result = self._execute_core(agent, context, tools)
    emit(TaskCompletedEvent)
except Exception as e:
    emit(TaskFailedEvent(error=str(e)))
    raise
finally:
    clear_task_files()
    reset_context()

# Crew-level:
try:
    output = self._execute_tasks(tasks)
    emit(CrewKickoffCompletedEvent)
except Exception as e:
    emit(CrewKickoffFailedEvent)
finally:
    drain_memory()  # Always cleanup
```

**Analysis**: CrewAI has **no agent-level retry** built into the orchestrator. If an agent fails, the task fails, and the crew fails. Guardrails provide *output* validation but not *agent health* monitoring.

### 2.6 Validation at Initialization

CrewAI front-loads validation via Pydantic validators:

| Validation Rule | Process Type |
|---|---|
| Every task must have an agent | Sequential |
| `manager_llm` or `manager_agent` required | Hierarchical |
| At most one async task at end | Both |
| No context deps on future tasks | Both |
| At least one non-conditional task | Both |
| First task cannot be conditional | Both |

### 2.7 Memory System

Four-tier memory:
- **Short-term**: Within single execution context
- **Long-term**: Persists across crew executions
- **Entity**: Tracks people, places, concepts
- **External**: Custom storage backends

### 2.8 Communication Pattern

**Strictly sequential pipeline** in sequential mode. **Manager-mediated** in hierarchical mode. No direct agent-to-agent communication. Context flows through task outputs only.

---

## 3. MetaGPT (geekan/MetaGPT)

### 3.1 Architecture Overview

MetaGPT implements a **software company simulation** with an explicit SOP (Standard Operating Procedure):

```
┌──────────────────────────────────────────────────┐
│                     Team                           │
│  ┌─────────────────────────────────────────────┐  │
│  │              Environment                     │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐    │  │
│  │  │ProductMgr│ │Architect │ │ProjectMgr│    │  │
│  │  │  _watch: │ │  _watch: │ │  _watch: │    │  │
│  │  │  [User   │ │  [Write  │ │  [Write  │    │  │
│  │  │   Req]   │ │   PRD]   │ │  Design] │    │  │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘    │  │
│  │       │             │             │          │  │
│  │  ┌────▼─────────────▼─────────────▼──────┐  │  │
│  │  │      Message Buffer (per-role)         │  │  │
│  │  │      + Environment.publish_message()   │  │  │
│  │  └───────────────────────────────────────┘  │  │
│  │                                              │  │
│  │  ┌──────────┐ ┌──────────┐                  │  │
│  │  │ Engineer │ │  QA Eng  │                  │  │
│  │  │  _watch: │ │  _watch: │                  │  │
│  │  │  [Write  │ │  [Write  │                  │  │
│  │  │  Tasks]  │ │   Code]  │                  │  │
│  │  └──────────┘ └──────────┘                  │  │
│  └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 3.2 The SOP Implementation

MetaGPT's SOP is **implicit in the `_watch` mechanism**, not a separate data structure:

```python
# Each role watches specific action types:
class ProductManager(Role):
    def __init__(self):
        self._watch([UserRequirement])  # Triggers on user input

class Architect(Role):
    def __init__(self):
        self._watch([WritePRD])  # Triggers when PM writes PRD

class ProjectManager(Role):
    def __init__(self):
        self._watch([WriteDesign])  # Triggers when Architect writes design

class Engineer(Role):
    def __init__(self):
        self._watch([WriteTasks])  # Triggers when PM writes tasks
```

**The SOP emerges from the chain of watched actions**:
```
UserRequirement → ProductManager → WritePRD
    → Architect → WriteDesign
    → ProjectManager → WriteTasks
    → Engineer → WriteCode
    → QA → WriteTest
```

### 3.3 Role Execution — The Observe-Think-Act Loop

```python
async def run(self, with_message=None):
    # 1. OBSERVE: Check for new relevant messages
    if not await self._observe():
        return  # Nothing to do

    # 2. REACT: Think-act loop
    rsp = await self.react()

    # 3. PUBLISH: Broadcast result
    self.publish_message(rsp)
    return rsp

async def _observe(self) -> int:
    news = self.rc.msg_buffer.pop_all()
    # Filter: only messages caused by watched actions OR sent directly to this role
    self.rc.news = [
        n for n in news
        if (n.cause_by in self.rc.watch or self.name in n.send_to)
        and n not in old_messages
    ]
    return len(self.rc.news)

async def _react(self) -> Message:
    actions_taken = 0
    while actions_taken < self.rc.max_react_loop:
        has_todo = await self._think()
        if not has_todo:
            break
        rsp = await self._act()
        actions_taken += 1
    return rsp
```

### 3.4 Message Routing — Environment

```python
def publish_message(self, message, peekable=True):
    """Route message to recipients based on address matching."""
    found = False
    for role, addrs in self.member_addrs.items():
        if is_send_to(message, addrs):
            role.put_message(message)
            found = True
    if not found:
        logger.warning(f"Message no recipients: {message.dump()}")
    self.history.add(message)

async def run(self, k=1):
    """Execute all non-idle roles concurrently."""
    for _ in range(k):
        futures = []
        for role in self.roles.values():
            if role.is_idle:
                continue
            futures.append(role.run())
        if futures:
            await asyncio.gather(*futures)
```

**Key insight**: Roles run **concurrently** within each round (`asyncio.gather`). The Team runs multiple rounds, checking for idle state:

```python
async def run(self, n_round=3, idea=""):
    if idea:
        self.run_project(idea=idea)
    while n_round > 0:
        if self.env.is_idle:
            break
        n_round -= 1
        self._check_balance()
        await self.env.run()
```

### 3.5 Code Review Pipeline — The Only "Revision" Mechanism

```python
# In Engineer._act_sp_with_cr():
for todo in self.code_todos:
    coding_context = await todo.run()  # Generate code
    if review:
        action = WriteCodeReview(i_context=coding_context)
        coding_context = await action.run()  # Review + rewrite

# WriteCodeReview.run() implements a k-iteration review loop:
for i in range(k):  # k = code_validate_k_times
    result, rewritten_code = await self.write_code_review_and_rewrite(...)
    if "LBTM" in result:  # Looks Bad To Me
        iterative_code = rewritten_code  # Try again with rewrite
    elif "LGTM" in result:  # Looks Good To Me
        return coding_context  # Accept
```

**Review criteria** (embedded in prompt):
1. Requirement alignment
2. Logic correctness
3. Architecture compliance
4. Implementation completeness
5. Dependency correctness
6. Code reuse patterns

### 3.6 Error Handling

MetaGPT's error handling is **budget-based**, not fault-based:
```python
def _check_balance(self):
    if self.cost_manager.total_cost >= self.cost_manager.max_budget:
        raise NoMoneyException(...)
```

Individual actions use retry decorators:
```python
@retry(wait=wait_random_exponential(min=1, max=60), stop=stop_after_attempt(6))
async def write_code(self, prompt):
    code_rsp = await self._aask(prompt)
    return CodeParser.parse_code(text=code_rsp)
```

**No mechanism for detecting or handling role-level failures** beyond LLM call retries.

---

## 4. Comparative Analysis Matrix

### 4.1 Coordination Mechanisms

| Feature | AutoGen v0.4 | CrewAI | MetaGPT |
|---|---|---|---|
| **Speaker Selection** | LLM-based / Round-robin / Handoff / Ledger | Process-type driven (seq/hier) | Implicit via `_watch` subscriptions |
| **Communication** | Topic-based pub-sub | Pipeline (task outputs) | Address-based message routing |
| **Topology** | Hub-and-spoke (manager-centric) | Sequential pipeline or hierarchical | Pub-sub with role subscriptions |
| **Parallel Execution** | Yes (multiple active speakers) | Limited (one async task at end) | Yes (asyncio.gather per round) |
| **Dynamic Routing** | Yes (SelectorGroupChat, Swarm) | No (fixed at initialization) | Partially (send_to field) |

### 4.2 Fault Handling

| Feature | AutoGen v0.4 | CrewAI | MetaGPT |
|---|---|---|---|
| **Agent Error Recovery** | Terminate with error (except MagenticOne) | Task fails, crew fails | LLM retry with backoff |
| **Output Validation** | None built-in | Guardrails + Pydantic schemas | Code review loop (LGTM/LBTM) |
| **Stall Detection** | MagenticOne only (progress ledger) | None | None |
| **Loop Detection** | MagenticOne only | None | None |
| **Retry Mechanism** | JSON parse retries (MagenticOne) | Guardrail retries | Action-level LLM retries |
| **Graceful Degradation** | No | No | No |

### 4.3 State Management

| Feature | AutoGen v0.4 | CrewAI | MetaGPT |
|---|---|---|---|
| **Serialization** | Full (save_state/load_state per agent) | Partial (memory persistence) | Full (serialize/deserialize) |
| **Checkpointing** | Per-agent state snapshots | Per-execution memory | Team-level serialization |
| **Recovery from Crash** | Load state + resume | Replay from start | Deserialize + resume |

### 4.4 Consensus / Voting

| Feature | AutoGen v0.4 | CrewAI | MetaGPT |
|---|---|---|---|
| **Multi-agent Voting** | No | No | No |
| **Consensus Protocol** | No | No | No |
| **Quorum Requirements** | No | No | No |
| **Dissent Handling** | No | No | No |

**NONE of the three frameworks implement any form of consensus or voting.**

---

## 5. Critical Gap Analysis

### 5.1 Gaps That NONE of These Frameworks Address

#### Gap 1: Mutual Health Monitoring
**What exists**: AutoGen terminates on error. CrewAI fails the crew. MetaGPT retries LLM calls.
**What's missing**: No framework has agents monitoring each other's health. There is no heartbeat mechanism, no peer assessment of output quality over time, no detection of gradual degradation. All frameworks assume agents either work or crash — there is no concept of an agent producing subtly wrong output.

#### Gap 2: Finding Dismissal with Voting
**What exists**: Speaker selection is either deterministic (round-robin), single-LLM-decided (Selector), or self-directed (Swarm handoff).
**What's missing**: No framework supports a collective decision to remove or replace an agent. There is no voting mechanism where agents can propose that a peer is underperforming. In all three frameworks, agent membership is fixed at initialization.

#### Gap 3: Context Drift Detection
**What exists**: MagenticOne tracks task progress via ledger. MetaGPT checks if code meets requirements via review.
**What's missing**: No framework detects when an agent's outputs have drifted from the original task context. There is no mechanism to compare current agent behavior against its initial briefing or to detect semantic drift in a long conversation. If an agent starts producing irrelevant but syntactically valid output, none of these frameworks would notice.

#### Gap 4: Configurable Consensus Policies
**What exists**: Fixed orchestration patterns — you pick one (round-robin, selector, swarm, sequential, hierarchical).
**What's missing**: No framework offers a policy engine where you can define rules like "require 2-of-3 agents to agree before proceeding" or "escalate to human if agents disagree for more than N rounds." Consensus is not a first-class concept in any framework.

#### Gap 5: Dynamic Agent Replacement
**What exists**: Fixed participant lists set at initialization.
**What's missing**: No framework supports hot-swapping an agent during execution. If an agent is producing poor results, you cannot replace it with a fresh instance or a different model. AutoGen's state management comes closest (you could theoretically save state, modify participants, reload), but there is no built-in API for this.

#### Gap 6: Peer-to-Peer Communication
**What exists**: All three use hub-and-spoke or broadcast patterns.
**What's missing**: True peer-to-peer negotiation between agents without going through a central manager. While MetaGPT's `send_to` field allows targeted messaging, the Environment still mediates all communication. No framework supports direct agent-to-agent channels.

#### Gap 7: Quality Scoring Over Time
**What exists**: One-shot validation (CrewAI guardrails, MetaGPT code review).
**What's missing**: No framework maintains a quality score for each agent over time. There is no concept of "Agent X has been degrading in quality over the last 5 interactions" — only binary pass/fail on individual outputs.

### 5.2 What Each Framework Does Best (Lessons for Our Design)

| Framework | Strength to Adopt |
|---|---|
| **AutoGen (MagenticOne)** | Progress ledger + stall detection + replanning. The idea of maintaining explicit facts and plans, then checking if progress is being made, is the closest existing pattern to what we need for context drift detection. |
| **AutoGen (Swarm)** | Agent-initiated handoffs. The `HandoffMessage` pattern is elegant — agents decide when to pass control, rather than a central orchestrator. |
| **CrewAI** | Guardrail validation loop. The pattern of validating output, feeding errors back, and retrying with context is directly applicable to our quality checking. |
| **MetaGPT** | Subscription-based SOP. The `_watch` mechanism creates implicit workflows without rigid orchestration. Roles react to relevant events, enabling emergent coordination. |
| **MetaGPT** | Code review loop with LGTM/LBTM. The iterative review pattern with explicit accept/reject criteria is a template for our peer review system. |

### 5.3 Architectural Recommendations for Our Design

Based on this analysis, our multi-agent system should implement:

1. **Hybrid Communication**: Combine MetaGPT's subscription-based routing with AutoGen's topic-based pub-sub. Allow both broadcast and targeted messaging.

2. **Peer Health Protocol**: Implement mutual health monitoring where each agent periodically evaluates its peers' recent outputs against expected criteria. This is a novel contribution — no existing framework does this.

3. **Consensus Engine**: Build a configurable policy layer that supports:
   - Majority voting (N-of-M must agree)
   - Weighted voting (experienced agents count more)
   - Unanimous consent for critical decisions
   - Escalation to human on persistent disagreement

4. **Context Drift Detector**: Inspired by MagenticOne's progress ledger, but applied to each agent individually. Periodically compare agent outputs against the original task brief using semantic similarity. Flag agents whose output relevance scores drop below a threshold.

5. **Dynamic Agent Pool**: Support hot-swap of agents during execution with state transfer. When an agent is voted out, its context and partial work should be transferable to a replacement.

6. **Quality Decay Tracking**: Maintain a rolling quality score per agent, updated after each output. Use this for weighted voting and dismissal triggers.

---

## 6. Code Pattern Reference

### 6.1 Pattern: Topic-Based Message Routing (AutoGen)
```python
# Register agent with topic
await runtime.register(agent_type, topic_type)

# Send to specific agent
await publish_message(msg, topic_id=DefaultTopicId(type=agent_topic))

# Broadcast to all
await publish_message(msg, topic_id=DefaultTopicId(type=group_topic))
```

### 6.2 Pattern: Subscription-Based SOP (MetaGPT)
```python
class MyRole(Role):
    def __init__(self):
        self._watch([TriggerAction1, TriggerAction2])

    async def _observe(self):
        self.rc.news = [n for n in news if n.cause_by in self.rc.watch]
```

### 6.3 Pattern: Guardrail Validation Loop (CrewAI)
```python
for attempt in range(max_retries):
    result = agent.execute(task, context)
    validation = guardrail.validate(result)
    if validation.success:
        return result
    context += f"\nValidation error: {validation.error}"
raise GuardrailFailure(f"Failed after {max_retries} attempts")
```

### 6.4 Pattern: Progress Ledger (AutoGen MagenticOne)
```python
ledger = {
    "is_request_satisfied": bool,
    "is_progress_being_made": bool,
    "is_in_loop": bool,
    "instruction_or_question": str,
    "next_speaker": str
}
if not ledger["is_progress_being_made"]:
    n_stalls += 1
if n_stalls > max_stalls:
    replan()
```

### 6.5 Pattern: Iterative Code Review (MetaGPT)
```python
for i in range(max_review_iterations):
    review_result = await review_action.run(code)
    if "LGTM" in review_result:
        return code  # Accepted
    elif "LBTM" in review_result:
        code = review_result.rewritten_code  # Revise and retry
```

---

## 7. Summary of Findings

| Dimension | AutoGen | CrewAI | MetaGPT | Our Need |
|---|---|---|---|---|
| Consensus/Voting | None | None | None | Required |
| Faulty Output Detection | MagenticOne stall detection only | Guardrails (single-shot) | Code review (iterative) | Continuous quality scoring |
| Dynamic Agent Replacement | No | No | No | Required |
| Communication Pattern | Pub-sub (hub-spoke) | Pipeline | Pub-sub (subscription) | Hybrid + P2P |
| State Management | Full serialization | Partial | Full serialization | Full + transfer on replacement |
| Health Monitoring | None | None | None | Mutual peer monitoring |
| Context Drift | Progress ledger (MagenticOne) | None | None | Per-agent semantic tracking |
| Configurable Policies | Fixed strategies | Fixed process types | Fixed SOP | Policy engine |

**Bottom line**: The existing frameworks provide solid foundations for agent communication and task execution, but they all treat multi-agent coordination as a **centralized orchestration problem**. None of them model the agents as peers capable of mutual oversight, collective decision-making, or self-healing. These are the capabilities our design must pioneer.
