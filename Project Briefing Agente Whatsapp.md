**Título do Projeto:** Assistente Pessoal Inteligente via WhatsApp

**Objetivo do Projeto**

Desenvolver um agente de inteligência artificial integrado ao WhatsApp que atue como assistente pessoal do usuário, automatizando tarefas de gestão de arquivos, organização de agenda e coordenação de reuniões. A interação será feita por meio de mensagens de texto ou áudio, em linguagem natural, tornando a experiência simples e intuitiva.

**Funcionalidades Principais**

_1. Gestão de Arquivos no Google Drive_

O usuário envia um arquivo pelo WhatsApp e, por meio de uma mensagem de texto ou áudio, solicita que o agente o armazene no Google Drive. O agente deve interpretar o comando, identificar o arquivo anexado na conversa e realizar o upload automaticamente, confirmando a ação ao usuário.

_2. Organização de Agenda no Google Calendar_

Sempre que o usuário mencionar um compromisso — informando data, horário e descrição do evento — o agente deve criar automaticamente o evento no Google Agenda do usuário. O agente precisa ser capaz de interpretar formatos variados de linguagem natural (ex.: "tenho dentista amanhã às 15h", "marca uma reunião pra sexta às 10h").

_3. Agendamento e Coordenação de Reuniões_

Quando o usuário informar que possui uma reunião, o agente deve: criar o evento no Google Agenda com os dados fornecidos; gerar automaticamente um link de videoconferência (Google Meet); e enviar o convite com o link da reunião para todos os participantes mencionados, seja via e-mail ou via WhatsApp, conforme os contatos compartilhados pelo usuário com o agente.

**Canais e Integrações**

Interface principal: WhatsApp (texto e áudio). Integrações necessárias: Google Drive API, Google Calendar API, Google Meet, serviço de envio de e-mails (Gmail API ou similar) e API do WhatsApp Business para envio de mensagens a terceiros.