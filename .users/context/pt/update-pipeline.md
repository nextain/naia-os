# Pipeline de Atualização do OS

## Como Funcionam as Atualizações

O Naia OS é construído sobre o [Bazzite](https://github.com/ublue-os/bazzite) (Fedora Atomic). O teu sistema recebe atualizações através de **deployments atómicos de imagens de contêiner**, e não por atualizações tradicionais de pacotes.

### Fluxo de Atualização
Bazzite publica nova imagem base
  ↓ (todas as quartas-feiras, reconstrução automática)
Contêiner Naia reconstruído sobre Bazzite (BlueBuild)
  ↓
Teste rápido do contêiner (verificar pacotes, branding, Naia Shell)
  ↓ passa
Push para GHCR (ghcr.io/nextain/naia-os:latest)
  ↓                              ↓
ISO reconstruída + carregada para R2     Sistemas instalados: bootc update


### O Que Personalizamos (Overlay Nosso)

| Categoria | O Que | Risco para o Boot |
|----------|------|-----------------|
| Pacotes | fcitx5 (input coreano), fonts, jq, sqlite, podman | Nenhum — pacotes padrão do Fedora |
| Naia Shell | App Flatpak (sandboxed, atualização independente) | Nenhum — corre dentro do sandbox Flatpak |
| Branding | os-release, wallpaper, ecrã de login, tema Plymouth | Nenhum — apenas visual |
| Configuração KDE | Ícones fixos na taskbar, ícone do kickoff, definição do wallpaper | Nenhum — apenas na sessão do utilizador |
| Autostart | Entrada XDG autostart do Naia Shell | Nenhum — apenas lança a app |

**Nunca alteramos:** kernel, initrd, bootloader, core do systemd, política SELinux, internals do ostree/bootc.

---

## Garantias de Segurança

### Atualizações Atómicas
Novas imagens são aplicadas **em paralelo à versão atual**. A troca acontece no reboot. Se o deployment falhar, a imagem antiga permanece intacta.

### Rollback Automático
Cada atualização mantém a versão anterior. Se a nova imagem falhar ao arrancar:

1. Reboot da máquina  
2. No menu do GRUB, seleciona a entrada anterior  
3. O sistema arranca com a última imagem funcional conhecida

### Teste Rápido do Contêiner
Cada build executa verificações automáticas antes do deployment:

- Pacotes requeridos instalados (fcitx5, fonts)  
- Branding aplicado (os-release mostra “Naia”)  
- Bundle do Naia Shell presente  
- Scripts do KDE Plasma aplicados  
- Entrada de autostart existe

Se algum teste falhar, o build é marcado como **falhado** e nenhuma ISO é gerada.

### Rollback da ISO
Antes de carregar uma nova ISO para o servidor de downloads (R2), a versão anterior é guardada em `previous/`. Se for publicada uma ISO com problemas, pode ser revertida imediatamente.

---

## Níveis de Teste

| Nível | O Que | Automatizado | Quando |
|------|------|-------------|-------|
| 1. Container Smoke | Verificação de pacotes/branding/ficheiros | Sim (CI) | Cada build |
| 2. Boot da ISO | Teste de arranque no QEMU | Semi-automático | Alterações importantes |
| 3. Verificação Manual | Instalação via VNC + verificação de funcionalidades | Manual | Atualizações de versão do Fedora |
| 4. Caminho de Atualização | bootc upgrade + reboot em VM real | Manual | Antes de ativar auto-update |

---

## Riscos Conhecidos

### Alteração Quebrada do Bazzite (Médio)
Se o Bazzite publicar uma imagem base com problemas, a reconstrução semanal irá captá-la. O teste rápido do contêiner detecta problemas de pacotes/configuração, mas pequenas falhas de runtime podem passar. O rollback do ostree permite recuperação.

### Alteração do Formato do Ficheiro .origin (Alto, apenas ISO)
O instalador da ISO usa `sed` para definir a referência da imagem do contêiner no ficheiro `.origin` do ostree. Se o bootc alterar o formato, a instalação pode falhar. Afeta apenas novas instalações, não updates de sistemas existentes.

### Conflito na Configuração KDE (Baixo)
Se o Bazzite alterar os padrões do KDE, os scripts de atualização do Plasma podem entrar em conflito. Os scripts usam prefixo `naia-*` e correm apenas na sessão do utilizador, minimizando o risco.

### Reversão do Tema Plymouth (Baixo)
O tema de boot do Plymouth pode reverter para o padrão do Bazzite após atualizações (requere regeneração do initrd). Apenas visual — não afeta o arranque.

---

## Para Utilizadores

### Como Atualizar
Num sistema Naia OS instalado:

```bash
# Verificar atualizações
sudo bootc upgrade --check

# Aplicar atualização (efetiva no próximo reboot)
sudo bootc upgrade

# Ver versão do OS
cat /etc/os-release | grep PRETTY_NAME

# Ver informação da imagem do contêiner
cat /usr/share/ublue-os/image-info.json