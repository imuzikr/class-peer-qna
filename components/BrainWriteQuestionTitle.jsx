// 학생이 던진 질문은 교사 수업 창과 학생 방송 화면에서 같은 제목으로 보여 줍니다.
export default function BrainWriteQuestionTitle({ name, text }) {
  return (
    <section className="bw-cast-question" aria-label={`${name || "학생"}의 질문`}>
      <span className="bw-cast-question-by">질문 <strong>{name}</strong></span>
      <p className={text ? "" : "empty"}>{text || "아직 질문을 쓰지 않았어요"}</p>
    </section>
  );
}
