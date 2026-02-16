export const messages = {
  processing: {
    default: 'Processando sua mensagem...',
    audio: 'Processando seu audio...',
    file: 'Processando seu arquivo...',
    event: 'Agendando seu compromisso...',
    meeting: 'Organizando sua reuniao...',
  },

  errors: {
    generic: 'Desculpe, ocorreu um erro. Tente novamente em alguns instantes.',
    calendarUnavailable: 'Nao consegui acessar sua agenda. Tente novamente em alguns minutos.',
    driveUnavailable: 'Nao consegui acessar seu Google Drive. Tente novamente em alguns minutos.',
    whisperFailed: 'Nao consegui entender o audio. Pode enviar por texto?',
    gptFailed: 'Estou com dificuldade para processar sua mensagem. Tente reformular.',
    authError: 'Preciso que voce reconecte sua conta Google. Acesse: {authUrl}',
    serviceUnavailable: 'O servico esta temporariamente indisponivel. Tente novamente em alguns minutos.',
    fileTooLarge: 'O arquivo e muito grande. O limite e de 100MB.',
    invalidEmail: 'O email "{email}" parece invalido. Verifique e tente novamente.',
    eventNotFound: 'Nao encontrei nenhum evento com essa descricao.',
    whatsappError: 'Nao consegui enviar a mensagem. Tente novamente.',
  },

  confirmations: {
    eventCreated: 'Evento "{titulo}" criado para {data} as {hora}.',
    meetingCreated: 'Reuniao "{titulo}" criada para {data} as {hora}.\nLink Meet: {meetLink}\nConvites enviados: {convites}',
    fileUploaded: 'Arquivo "{filename}" salvo em {folderPath}.',
    eventCancelled: 'Evento "{titulo}" cancelado com sucesso.',
    reminder: 'Lembrete: "{titulo}" comeca em {minutos} minutos.{meetLink}',
  },

  prompts: {
    clarification: 'Nao entendi bem. Voce quer:\n1. Agendar um evento\n2. Criar uma reuniao\n3. Salvar um arquivo\n4. Outra coisa',
    uploadInstruction: 'Para salvar um arquivo, envie-o diretamente nesta conversa.',
    cancelConfirm: 'Cancelar "{titulo}" em {data}? Responda "sim" para confirmar.',
    cancelDiscarded: 'Cancelamento descartado.',
    invalidOption: 'Opcao invalida. Tente novamente.',
    multipleEvents: 'Encontrei {count} eventos. Qual deseja cancelar?\n{lista}',
    conflictWarning: 'Voce ja tem "{existente}" nesse horario. Deseja agendar mesmo assim?',
    pastDate: 'Essa data ja passou. Deseja agendar para a proxima {diaSemana}?',
    meetingInvite: 'Convite para reuniao "{titulo}" em {dateTime}.{meetLink}',
    help: 'Posso ajudar com:\n- Salvar arquivos no Google Drive\n- Agendar eventos na sua agenda\n- Criar reunioes com link do Meet\n- Cancelar eventos\n- Enviar lembretes de compromissos\n\nE so me dizer o que precisa!',
  },
} as const;
