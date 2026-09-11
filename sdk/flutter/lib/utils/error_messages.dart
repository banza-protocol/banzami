import 'dart:async';

import '../client/api_exception.dart';

/// The one place a failure becomes words a Banzami user reads.
///
/// Order: the server's error `code` first (the codes the public-api and the
/// gateway really send — services/public-api/internal/handler,
/// services/api-gateway/internal/handler), then the HTTP status class, then
/// the transport. The server's `message` is English diagnostic text for
/// developers and is never shown.
///
/// [codes] lets a screen say something more precise for a code in its own
/// context (at sign-in, `INVALID_CREDENTIALS` is "PIN incorrecto"); [statuses]
/// does the same for a status class. Neither can ever surface `e.message`.
String banzamiErrorMessage(
  Object error, {
  Map<String, String> codes = const {},
  Map<int, String> statuses = const {},
}) {
  if (error is BanzamiApiException) {
    final code = error.code.toUpperCase();
    final byContext = codes[code];
    if (byContext != null) return byContext;
    final byCode = _byCode(code);
    if (byCode != null) return byCode;
    final byStatus = statuses[error.statusCode];
    if (byStatus != null) return byStatus;
    return _byStatus(error.statusCode);
  }
  if (error is TimeoutException) return kBanzamiTimeoutMessage;
  if (error is BanzamiNetworkException) return kBanzamiOfflineMessage;
  return kBanzamiGenericErrorMessage;
}

/// No answer reached the phone — nothing is known about the outcome.
const String kBanzamiOfflineMessage =
    'Sem ligação ao Banzami. Verifique a sua rede e tente novamente.';

/// The request left but the answer did not arrive in time.
const String kBanzamiTimeoutMessage =
    'O Banzami demorou demasiado a responder. Tente novamente.';

const String kBanzamiGenericErrorMessage =
    'Não foi possível concluir. Tente novamente.';

const String kBanzamiSessionEndedMessage =
    'A sua sessão terminou. Entre novamente.';

/// Whether [error] says nothing about the outcome — no answer, or an answer
/// from a proxy/outage rather than a decision. A money request that failed
/// this way may still have been executed.
bool isOutcomeUnknown(Object error) {
  if (error is BanzamiNetworkException || error is TimeoutException) {
    return true;
  }
  if (error is BanzamiApiException) return error.statusCode >= 500;
  return false;
}

String? _byCode(String code) {
  if (code.startsWith('PILOT_LIMIT_')) return _pilotLimit(code);
  switch (code) {
    // Money movement
    case 'INSUFFICIENT_FUNDS':
      return 'Saldo insuficiente para esta operação.';
    case 'SELF_TRANSFER_NOT_ALLOWED':
    case 'SELF_TRANSFER':
      return 'Não pode enviar dinheiro para si mesmo.';
    case 'RECIPIENT_NOT_FOUND':
    case 'CONSUMER_NOT_FOUND':
      return 'Este @banza não existe.';
    case 'RECIPIENT_UNAVAILABLE':
    case 'RECIPIENT_NOT_ROUTABLE':
      return 'Este destinatário não pode receber dinheiro neste momento.';
    case 'INVALID_RECIPIENT':
    case 'INVALID_HANDLE':
      return 'Este @banza não é válido.';
    case 'WALLET_LOCKED':
    case 'ACCOUNT_FROZEN':
      return 'A sua carteira está bloqueada. Contacte o suporte.';
    case 'SENDER_WALLET_NOT_ACTIVE':
    case 'NO_WALLET':
      return 'A sua carteira não está activa.';
    case 'WALLET_NOT_FOUND':
      return 'A carteira de destino não está disponível.';
    case 'TRANSFER_FAILED':
      return 'A transferência não foi concluída. Tente novamente.';
    case 'INVALID_AMOUNT':
    case 'MISSING_AMOUNT':
      return 'Montante inválido.';
    case 'UNSUPPORTED_CURRENCY':
    case 'INVALID_CURRENCY':
      return 'Esta moeda não é suportada.';
    case 'IDEMPOTENCY_KEY_REUSED':
    case 'IDEMPOTENCY_CONFLICT':
      return 'Este pedido já foi registado. Confirme na sua actividade antes de repetir.';
    case 'KYC_REQUIRED':
      return 'Precisa de verificar a sua identidade para continuar.';

    // Links and QR
    case 'LINK_NOT_ACTIVE':
      return 'Este link de pagamento já não está activo.';
    case 'LINK_EXPIRED':
      return 'Este link de pagamento expirou.';
    case 'LINK_ALREADY_PAID':
      return 'Este link já foi pago. Confirme na sua actividade.';
    case 'QR_EXPIRED':
      return 'Este QR expirou.';
    case 'QR_ALREADY_USED':
      return 'Este QR já foi utilizado.';
    case 'MERCHANT_NOT_ACTIVE':
    case 'MERCHANT_INACTIVE':
      return 'Este negócio não está a aceitar pagamentos.';

    // Identity, sign-in, onboarding
    case 'INVALID_CREDENTIALS':
      return '@banza ou PIN incorrectos.';
    case 'LOCKED':
    case 'RATE_LIMITED':
      return 'Demasiadas tentativas. Aguarde um momento e tente novamente.';
    case 'SESSION_ENDED':
    case 'TOKEN_EXPIRED':
    case 'INVALID_TOKEN':
      return kBanzamiSessionEndedMessage;
    case 'OTP_INVALID':
      return 'Código incorrecto.';
    case 'OTP_EXPIRED':
      return 'O código expirou. Peça um novo.';
    case 'HANDLE_TAKEN':
      return 'Este @banza já está em uso.';
    case 'HANDLE_RESERVED':
    case 'HANDLE_OWNED_BY_BUSINESS':
      return 'Este @banza não está disponível.';
    case 'PIN_POLICY_FAILED':
      return 'Este PIN é demasiado fácil de adivinhar. Escolha outro.';

    // Verification (KYC / KYB) and payouts
    case 'EVIDENCE_INCOMPLETE':
      return 'Faltam documentos para submeter a verificação.';
    case 'STORAGE_NOT_CONFIGURED':
    case 'OBJECT_NOT_UPLOADED':
      return 'O envio de documentos não foi concluído. Tente novamente.';
    case 'INVALID_MIME_TYPE':
      return 'Formato de ficheiro não aceite.';
    case 'KYB_REQUIRED':
      return 'Os levantamentos ficam disponíveis quando a verificação do negócio (KYB e AML) estiver aprovada.';
    case 'COMPLIANCE_UNAVAILABLE':
      return 'A verificação de conformidade está indisponível. Tente novamente em instantes.';
    case 'SANDBOX_ONLY':
      return 'Disponível apenas no ambiente de testes (Sandbox).';
  }
  return null;
}

String _pilotLimit(String code) {
  switch (code) {
    case 'PILOT_LIMIT_AGGREGATE_FUNDS_EXCEEDED':
      return 'O piloto atingiu o limite total de fundos de teste. Não é possível adicionar mais fundos por agora.';
    case 'PILOT_LIMIT_CONSUMER_BALANCE_EXCEEDED':
    case 'PILOT_LIMIT_MERCHANT_BALANCE_EXCEEDED':
      return 'Esta operação ultrapassa o saldo máximo permitido durante o piloto.';
    case 'PILOT_LIMIT_MERCHANT_DAILY_EXCEEDED':
      return 'Este negócio atingiu o limite diário do piloto.';
    default:
      return 'Esta operação ultrapassa os limites do piloto.';
  }
}

String _byStatus(int status) {
  if (status == 401) return kBanzamiSessionEndedMessage;
  if (status == 403) return 'Não tem permissão para esta operação.';
  if (status == 404) return 'Não encontrado.';
  if (status == 409) {
    return 'Esta operação já foi registada ou mudou entretanto. Actualize e confirme.';
  }
  if (status == 422) return 'O pedido não pôde ser concluído.';
  if (status == 429) {
    return 'Demasiadas tentativas. Aguarde um momento e tente novamente.';
  }
  if (status >= 500) {
    return 'Serviço temporariamente indisponível. Tente novamente dentro de momentos.';
  }
  if (status >= 400) return 'Pedido inválido.';
  return kBanzamiGenericErrorMessage;
}
