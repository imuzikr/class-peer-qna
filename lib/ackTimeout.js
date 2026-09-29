// =============================================================
// 서버 확인을 끝없이 기다리지 않기 — 저장 단추가 '저장 중…'에 멈추는 것을 막습니다
// -------------------------------------------------------------
// Firestore의 쓰기(`updateDoc` 등)는 **서버가 받았다고 답할 때** 끝납니다.
// 연결이 끊겼거나 쓰기 통로가 다시 열리지 못하면(인증·App Check 토큰을 못 받는
// 경우 등) 그 답이 영영 안 와서, 약속이 실패하지도 끝나지도 않습니다. 그러면
// 창의 단추가 '저장 중…'에 멈춘 채 아무 말도 없습니다(실제 신고 — 프로젝트
// 원본 편집 창).
//
// 여기서는 정해 둔 시간 안에 답이 없으면 `AckTimeoutError`로 끝냅니다.
//   · **쓰기를 거두지는 않습니다** — Firestore가 줄에 넣어 둔 쓰기는 연결이
//     돌아오면 그대로 나갑니다. 끝내는 것은 '기다림'뿐입니다.
//   · 그래서 부르는 쪽은 창을 닫지 말고(고친 것을 잃지 않게) 까닭을 적은 뒤
//     단추를 다시 살립니다. 같은 값을 한 번 더 보내도 결과는 같습니다.
// =============================================================

export const ACK_TIMEOUT_MS = 15000;

export class AckTimeoutError extends Error {
  constructor(ms) {
    super(`서버가 ${Math.round(ms / 1000)}초 동안 답하지 않았어요`);
    this.name = "AckTimeoutError";
    this.code = "ack-timeout";
  }
}

export function withAckTimeout(promise, ms = ACK_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AckTimeoutError(ms)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => clearTimeout(timer));
}

export function isAckTimeout(err) {
  return err?.code === "ack-timeout";
}

// 창의 오류 줄에 적을 말 — 두 편집 창(원본 · 반 복사본)이 같은 말을 씁니다.
// 시간 초과는 '실패'가 아니라 '확인이 안 온 것'이라 할 일을 함께 적습니다.
export function saveErrorMessage(err) {
  if (isAckTimeout(err)) {
    return "서버가 저장을 확인해 주지 않고 있어요. 인터넷 연결을 확인한 뒤 '저장'을 한 번 더 눌러 주세요 — 고친 내용은 창에 그대로 있어요.";
  }
  return `저장하지 못했어요: ${err?.message ?? "알 수 없는 오류"}`;
}
