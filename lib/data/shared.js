// =============================================================
// 데모 모드의 메모리 자료(mock) · 구독자 목록 · 모듈끼리 나눠 쓰는 작은 도우미
// -------------------------------------------------------------
// lib/store.js에서 떼어 낸 조각입니다. 화면은 지금까지처럼 "@/lib/store"에서
// 가져갑니다 — store.js가 여기 공개 이름을 그대로 다시 내보냅니다.
// =============================================================
import { toDate, todayDateKey } from "../dates";
import { getCurrentUser } from "../user";

// 기본 키워드 — keywords 컬렉션이 비어 있을 때 자동으로 심는 초기값.
// 운영 중 키워드 관리(추가/삭제/순서)는 관리자가 데이터로 수행합니다.
export const DEFAULT_KEYWORDS = [
  "원자와 주기율표",
  "화학 결합",
  "화학 반응식",
  "산과 염기",
  "산화 환원",
  "반응 속도",
  "화학 평형",
  "탄소 화합물",
  "기타",
];
// (하위 호환용 별칭 — 키워드 목록이 아직 로드되기 전 폴백으로 사용)
export const KEYWORDS = DEFAULT_KEYWORDS;

// -------------------------------------------------------------
// 데모 모드용 임시 데이터 (새로고침하면 초기화됩니다)
// -------------------------------------------------------------
export const mock = {
  questions: [
    {
      id: "q1",
      title: "이온 결합과 공유 결합이 어떻게 다른가요?",
      content:
        "나트륨과 염소가 결합할 때는 이온 결합, 수소 분자는 공유 결합이라고 배웠는데 전자를 '주고받는 것'과 '공유하는 것'의 차이가 실제로 어떤 성질 차이로 나타나는지 이해가 안 됩니다.",
      keyword: "화학 결합",
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      answerCount: 1,
      resolved: true,
      understoodAnswerId: "a1",
      reflection: {
        learned:
          "이온 결합은 전자를 완전히 옮겨 이온이 되고, 공유 결합은 전자쌍을 함께 씁니다. 그래서 이온 결합 물질은 수용액에서 전기가 통하고, 공유 결합 물질은 대부분 통하지 않는다는 게 핵심이었어요.",
        next: "극성 공유 결합과 비극성 공유 결합의 차이도 이어서 정리해 봐야겠어요.",
        authorId: "sample_turtle",
        authorName: "느긋한 거북이",
        authorEmoji: "🐢",
        createdAt: new Date(Date.now() - 1000 * 60 * 80),
      },
      meTooIds: ["user_02", "user_03"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: "q2",
      title: "같은 주기에서 원자 반지름이 줄어드는 이유가 뭔가요?",
      content:
        "주기율표에서 같은 주기의 원소는 전자 껍질 수가 같은데, 오른쪽으로 갈수록 원자 반지름이 작아진다고 배웠어요. 양성자가 많아지면 전자를 더 강하게 당기기 때문이라고 하는데, 전자 수도 같이 늘어나는 거 아닌가요?",
      keyword: "원자와 주기율표",
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      answerCount: 0,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: [],
      createdAt: new Date(Date.now() - 1000 * 60 * 40),
    },
    {
      id: "q3",
      title: "pH와 pOH를 헷갈리지 않는 방법이 있을까요?",
      content:
        "산성 용액에서 pH가 낮으면 pOH는 높다고 배웠는데, 수용액에서 항상 pH + pOH = 14인 이유를 이해하고 싶어요. 어떻게 생각하면 쉬울까요?",
      keyword: "산과 염기",
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      answerCount: 2,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: [
        "sample_01",
        "sample_02",
        "sample_03",
        "sample_04",
        "sample_05",
        "sample_06",
        "sample_07",
        "sample_08",
      ],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: "q4",
      title: "화학 반응식 계수를 맞추는 체계적인 방법이 있나요?",
      content:
        "C₃H₈ + O₂ → CO₂ + H₂O 같은 반응식에서 계수를 눈대중으로 맞추다 보면 틀리는 경우가 있어요. 빠르고 확실하게 계수를 맞추는 방법이 궁금합니다.",
      keyword: "화학 반응식",
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 25),
    },
    {
      id: "q5",
      title: "산화수를 구할 때 규칙들이 너무 많아서 헷갈려요",
      content:
        "산화수 규칙이 너무 많아요. 홑원소 물질은 0, 이온은 이온 전하, H는 +1(금속 수소화물은 -1), O는 -2(과산화물은 -1)... 순서대로 적용하는 우선순위가 있나요?",
      keyword: "산화 환원",
      authorId: "sample_panda",
      authorName: "차분한 판다",
      authorEmoji: "🐼",
      authorRealName: "한지민",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
    {
      // "__me__" 표식 — 데모에서 읽는 시점에 현재 접속자(나)의 것으로 치환됩니다.
      id: "q6",
      title: "촉매가 왜 반응 속도를 빠르게 하는지 원리가 궁금해요",
      content:
        "촉매를 넣으면 반응이 빨라지지만 촉매 자신은 변하지 않는다고 배웠어요. 반응물도 생성물도 바뀌지 않는데 왜 속도만 빨라지는 건지 이해가 안 됩니다.",
      keyword: "반응 속도",
      authorId: "__me__",
      authorName: "나",
      authorEmoji: "🙂",
      authorRealName: "나",
      answerCount: 1,
      resolved: true,
      understoodAnswerId: "a6",
      reflection: {
        learned:
          "촉매는 활성화 에너지가 낮은 새로운 반응 경로를 열어 줘서, 같은 온도에서도 더 많은 분자가 그 에너지 장벽을 넘을 수 있게 됩니다. 반응 자체는 그대로지만 경로가 달라지는 거예요.",
        next: "효소가 생물 촉매인 이유도 같은 원리인지 찾아봐야겠어요.",
        authorId: "__me__",
        authorName: "나",
        authorEmoji: "🙂",
        createdAt: new Date(Date.now() - 1000 * 60 * 15),
      },
      meTooIds: ["sample_01", "sample_02"],
      createdAt: new Date(Date.now() - 1000 * 60 * 50),
    },
    {
      id: "q7",
      title: "르샤틀리에 원리를 수학적으로 이해하고 싶어요",
      content:
        "평형 상태에서 농도나 온도를 바꾸면 평형이 이동한다고 배웠는데, '평형을 되찾으려 한다'는 표현이 마치 계가 의도를 가진 것처럼 느껴져서 혼란스럽습니다. 수학적으로 설명해 줄 수 있나요?",
      keyword: "화학 평형",
      authorId: "sample_owl",
      authorName: "진지한 부엉이",
      authorEmoji: "🦉",
      authorRealName: "윤하은",
      answerCount: 1,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_03", "sample_04", "sample_05"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
    {
      id: "q8",
      title: "탄소 화합물에서 작용기가 왜 중요한가요?",
      content:
        "에탄올, 아세트산, 아세톤을 배웠는데 작용기(-OH, -COOH, -CO-)에 따라 성질이 크게 다르다고 했어요. 이걸 구조식만 보고 직관적으로 파악하는 방법이 있나요?",
      keyword: "탄소 화합물",
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      answerCount: 0,
      resolved: false,
      understoodAnswerId: null,
      meTooIds: ["sample_01", "sample_02", "sample_06"],
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 7),
    },
  ],
  answers: {
    q1: [
      {
        id: "a1",
        content:
          "가장 큰 차이는 '전기 전도성'이에요. 이온 결합 물질(NaCl 등)은 수용액 상태나 용융 상태에서 이온이 자유롭게 이동해 전기가 통하지만, 공유 결합 물질(설탕 등)은 이온이 없어서 전기가 통하지 않아요. 결합이 끊어지는 방식도 달라서 이온 결합은 쪼개지면 이온이 되고, 공유 결합은 분자가 되는 거예요.",
        authorId: "sample_penguin",
        authorName: "명랑한 펭귄",
        authorEmoji: "🐧",
        authorRealName: "박지후",
        createdAt: new Date(Date.now() - 1000 * 60 * 90),
      },
    ],
    q3: [
      {
        id: "a2",
        content:
          "pH + pOH = 14는 수용액에서 [H⁺][OH⁻] = 10⁻¹⁴(Kw)라는 사실에서 나와요. 양쪽에 -log를 취하면 pH + pOH = 14예요. 산성 → [H⁺]↑이면 [OH⁻]↓라 pH가 낮을수록 pOH는 높아지는 거예요.",
        authorId: "sample_penguin",
        authorName: "명랑한 펭귄",
        authorEmoji: "🐧",
        authorRealName: "박지후",
        createdAt: new Date(Date.now() - 1000 * 60 * 55),
      },
      {
        id: "a3",
        content:
          "간단하게 생각하면 수용액 속에서 H⁺와 OH⁻는 항상 같이 있는데, 한쪽이 많아지면 다른 쪽은 그만큼 줄어드는 관계예요. pH 7이 중성인 이유도 이 두 이온의 농도가 딱 같아질 때이기 때문이에요.",
        authorId: "sample_turtle",
        authorName: "느긋한 거북이",
        authorEmoji: "🐢",
        authorRealName: "김민준",
        createdAt: new Date(Date.now() - 1000 * 60 * 35),
      },
    ],
    q4: [
      {
        id: "a4",
        content:
          "탄소 포함 반응식은 C→CO₂, H→H₂O 순서로 먼저 맞추고 O를 마지막에 조정하는 게 빨라요. C₃H₈ + O₂ → CO₂ + H₂O 에서 C 3개 → CO₂ 3, H 8개 → H₂O 4, 그러면 O 오른쪽 = 6+4=10 → O₂ 5개. 완성: C₃H₈ + 5O₂ → 3CO₂ + 4H₂O",
        authorId: "sample_fox",
        authorName: "엉뚱한 여우",
        authorEmoji: "🦊",
        authorRealName: "이서연",
        createdAt: new Date(Date.now() - 1000 * 60 * 12),
      },
    ],
    q5: [
      {
        id: "a5",
        content:
          "우선순위는 다음과 같아요: ①홑원소=0 ②단원자 이온=이온전하 ③화합물에서 F=-1, O=-2(과산화물 제외), H=+1(금속수소화물 제외) ④나머지는 화합물 전체 전하합=0 조건으로 구해요. '전체 합이 0이 되어야 한다'는 원칙을 먼저 적용하면 복잡한 것도 풀려요.",
        authorId: "sample_dolphin",
        authorName: "재빠른 돌고래",
        authorEmoji: "🐬",
        authorRealName: "정다은",
        createdAt: new Date(Date.now() - 1000 * 60 * 150),
      },
    ],
    q6: [
      {
        id: "a6",
        content:
          "촉매는 활성화 에너지가 더 낮은 새로운 경로를 만들어요. 산이 에스터화 반응의 촉매인 경우처럼, 없으면 직접 충돌해야 하는 높은 에너지 장벽을 중간 단계로 쪼개 주는 거예요. 전체 에너지는 똑같지만 경로를 바꿔 뛰어넘기 쉽게 만드는 역할이에요.",
        authorId: "sample_owl",
        authorName: "진지한 부엉이",
        authorEmoji: "🦉",
        authorRealName: "윤하은",
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
      },
    ],
    q7: [
      {
        id: "a7",
        content:
          "르샤틀리에 원리는 의도가 아니라 Kc 식에서 나오는 수학적 결과예요. 평형 상수 Kc = [생성물]/[반응물]이 정해져 있는데, 농도가 바뀌면 반응 지수 Qc가 Kc와 달라져요. Q < Kc면 정반응, Q > Kc면 역반응이 우세해지고, 그 결과가 겉보기에는 '균형을 되찾으려는 것'처럼 보이는 거예요.",
        authorId: "sample_panda",
        authorName: "차분한 판다",
        authorEmoji: "🐼",
        authorRealName: "한지민",
        createdAt: new Date(Date.now() - 1000 * 60 * 200),
      },
    ],
  },
  notices: [
    {
      id: "n1",
      title: "질문 게시판 이용 안내",
      content:
        "화학 주제별 키워드를 선택해서 질문을 올려 주세요. 이해된 내용은 한 줄 정리(인사이트)로 남겨 두면 나중에 복습할 때 도움이 됩니다.",
      authorId: "teacher_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      id: "n2",
      title: "중간고사 범위 안내",
      content: "시험 범위: 원자와 주기율표, 화학 결합, 화학 반응식. 궁금한 내용은 게시판에 올려 주세요.",
      authorId: "teacher_01",
      authorName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5),
    },
  ],
  // 반(클래스) — 공부방은 반별 공간입니다. 학생은 입장 코드로 들어옵니다.
  // 질문 게시판은 전체 공유 공간이라 반과 무관합니다.
  classes: [
    {
      id: "cl1",
      name: "3학년 1반",
      joinCode: "MATH31",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48),
    },
    {
      id: "cl2",
      name: "3학년 2반",
      joinCode: "INFO32",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36),
    },
    {
      id: "cl3",
      name: "3학년 3반",
      joinCode: "BOND33",
      createdBy: "user_01",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12),
    },
  ],
  // 공부방 — 수업 보드(컬럼). type: 'notice'(수업 안내, 교사 전용) | 'student'(학생 보드)
  // classId로 반에 속합니다.
  studyBoards: [
    // cl1 — 3학년 1반
    {
      id: "b1",
      classId: "cl1",
      title: "수업 안내",
      type: "notice",
      description: "이번 수업의 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      createdBy: "teacher_01",
    },
    {
      id: "b2",
      classId: "cl1",
      title: "원자 모형 탐구",
      type: "student",
      description:
        "여러 원자 모형(톰슨·러더퍼드·보어·현대)의 변천을 정리하고, 각 모형이 설명하지 못했던 점을 중심으로 카드에 담아 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["원자와 주기율표"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      createdBy: "teacher_01",
    },
    {
      id: "b3",
      classId: "cl1",
      title: "이온 결합 모형 만들기",
      type: "student",
      description:
        "NaCl, MgO 등 이온 결합 물질을 예시로 들어, 전자 이동 과정과 이온 결합의 특징을 그림이나 글로 표현해 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["화학 결합"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
      createdBy: "teacher_01",
    },
    // cl2 — 3학년 2반
    {
      id: "b4",
      classId: "cl2",
      title: "수업 안내",
      type: "notice",
      description: "3학년 2반 수업 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
      createdBy: "teacher_01",
    },
    {
      id: "b5",
      classId: "cl2",
      title: "중화 반응 실험 정리",
      type: "student",
      description:
        "HCl + NaOH 중화 반응 실험 결과를 정리하고, 중화점에서의 변화와 이온 수 변화를 카드에 담아 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["산과 염기"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
      createdBy: "teacher_01",
    },
    {
      id: "b6",
      classId: "cl2",
      title: "반응 속도 탐구",
      type: "student",
      description:
        "농도·온도·촉매 중 하나를 골라 반응 속도에 미치는 영향을 실험 설계나 자료 해석으로 정리해 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["반응 속도"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      createdBy: "teacher_01",
    },
    // cl3 — 3학년 3반
    {
      id: "b7",
      classId: "cl3",
      title: "수업 안내",
      type: "notice",
      description: "3학년 3반 수업 자료와 안내 사항입니다.",
      viewMode: "shared",
      editMode: "open",
      keywords: [],
      order: 0,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10),
      createdBy: "teacher_01",
    },
    {
      id: "b8",
      classId: "cl3",
      title: "산화 환원 전지 탐구",
      type: "student",
      description:
        "다니엘 전지를 바탕으로 산화 전극과 환원 전극에서 일어나는 반응을 반쪽 반응식으로 정리해 보세요.",
      viewMode: "private",
      editMode: "open",
      keywords: ["산화 환원"],
      order: 1,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8),
      createdBy: "teacher_01",
    },
    {
      id: "b9",
      classId: "cl3",
      title: "화학 반응식 계수 맞추기",
      type: "student",
      description:
        "탄소 화합물이나 연소 반응 중 하나를 골라 화학 반응식 계수를 단계별로 맞추는 과정을 카드로 남겨 보세요.",
      viewMode: "shared",
      editMode: "open",
      keywords: ["화학 반응식"],
      order: 2,
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6),
      createdBy: "teacher_01",
    },
  ],
  // 공부방 카드 — boardId로 보드에 속합니다. 학생은 보드당 카드 1개.
  studyCards: [
    // b1 — cl1 수업 안내
    {
      id: "c1",
      boardId: "b1",
      content:
        "<p>오늘 수업 자료입니다. 교과서 112~117쪽(원자의 구조와 보어 모형)을 함께 봅니다. 활동 보드에 각자 탐구 정리 카드를 올려 주세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    // b2 — cl1 원자 모형 탐구
    {
      id: "c2",
      boardId: "b2",
      title: "보어 모형까지의 원자 모형 변천",
      content:
        "<p>보어 모형까지의 변천을 정리했어요. 톰슨의 건포도 모형은 전자 위치를 설명 못 했고, 러더퍼드는 궤도 붕괴 문제가 있었는데 보어가 '특정 에너지 준위만 가능'하다는 조건으로 해결했어요.</p>",
      imageUrl: null,
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      authorStudentId: "30103",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      // 데모에서 읽는 시점에 현재 접속자(나)의 것으로 치환됩니다.
      id: "c3",
      boardId: "b2",
      title: "현대 원자 모형과 확률 분포",
      content:
        "<p>현대 원자 모형에서는 전자의 정확한 위치 대신 '확률 분포'로 나타낸다는 점이 인상적이었어요. 전자구름이 진할수록 그 위치에서 전자를 발견할 확률이 높다는 것!</p>",
      authorId: "__me__",
      authorName: "나",
      authorEmoji: "🙂",
      authorRealName: "나",
      authorStudentId: "__me__",
      imageUrl: null,
      createdAt: new Date(Date.now() - 1000 * 60 * 40),
    },
    {
      id: "c4",
      boardId: "b2",
      title: "주기율표에서 원자 반지름 변화",
      content:
        "<p>주기율표에서 같은 주기는 전자 껍질 수가 같고, 같은 족은 원자가 전자 수가 같아요. 원자 반지름은 같은 주기에서 오른쪽으로 갈수록 핵전하가 커져 전자를 더 강하게 당기므로 작아져요.</p>",
      imageUrl: null,
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      authorStudentId: "30102",
      createdAt: new Date(Date.now() - 1000 * 60 * 55),
    },
    // b3 — cl1 이온 결합 모형 만들기
    {
      id: "c5",
      boardId: "b3",
      title: "NaCl 이온 결합 모형 분석",
      content:
        "<p>NaCl 이온 결합을 그려봤어요. Na는 전자 1개를 내주어 Na⁺, Cl은 전자 1개를 받아 Cl⁻가 되고, 반대 전하끼리 당기는 정전기적 인력으로 결합이 이뤄져요. 녹으면 이온이 자유롭게 움직여 전기가 통합니다.</p>",
      imageUrl: null,
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      authorStudentId: "30104",
      createdAt: new Date(Date.now() - 1000 * 60 * 50),
    },
    {
      id: "c6",
      boardId: "b3",
      title: "MgO 이온 결합과 결합 에너지",
      content:
        "<p>MgO의 경우 Mg²⁺와 O²⁻가 결합해요. 이온 전하가 크면 결합 에너지도 커서 녹는점이 NaCl보다 훨씬 높아요. 이온 결합의 세기는 이온의 전하량과 거리에 비례한다는 게 핵심이에요.</p>",
      imageUrl: null,
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      authorStudentId: "30101",
      createdAt: new Date(Date.now() - 1000 * 60 * 70),
    },
    // b4 — cl2 수업 안내
    {
      id: "c7",
      boardId: "b4",
      content:
        "<p>3학년 2반 수업 안내입니다. 오늘은 중화 반응 실험을 진행합니다. 실험 후 결과를 '중화 반응 실험 정리' 보드에 카드로 올려 주세요. BTB 용액 색 변화를 꼭 기록해 두세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 20),
    },
    // b5 — cl2 중화 반응 실험 정리
    {
      id: "c8",
      boardId: "b5",
      title: "중화 반응 실험 결과 정리",
      content:
        "<p>0.1M HCl 20mL에 0.1M NaOH를 20mL 넣었을 때 BTB가 노랑→초록이 됐어요. 중화점에서 H⁺와 OH⁻가 1:1로 반응해 물이 되고, Na⁺와 Cl⁻는 그대로 남아요. pH가 정확히 7이 됐어요.</p>",
      imageUrl: null,
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      authorStudentId: "30201",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    {
      id: "c9",
      boardId: "b5",
      title: "중화 반응 그래프 분석",
      content:
        "<p>중화 반응 그래프를 그려봤어요. 중화점 전에는 Cl⁻와 Na⁺가 같이 늘고, 중화점에서 H⁺=0이 됩니다. 중화점 이후 OH⁻가 남기 시작해요. NaOH를 과량으로 넣으면 염기성이 되는 이유가 이거예요.</p>",
      imageUrl: null,
      authorId: "sample_panda",
      authorName: "차분한 판다",
      authorEmoji: "🐼",
      authorRealName: "한지민",
      authorStudentId: "30202",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    // b6 — cl2 반응 속도 탐구
    {
      id: "c10",
      boardId: "b6",
      title: "온도와 반응 속도 관계",
      content:
        "<p>온도와 반응 속도 관계를 정리했어요. 온도를 올리면 분자들의 평균 운동 에너지가 증가해서, 활성화 에너지 이상의 에너지를 가진 분자 비율이 늘어나요. 10°C 오를 때마다 반응 속도가 약 2배가 된다는 반응 속도 이배 규칙을 실험으로 확인했어요.</p>",
      imageUrl: null,
      authorId: "sample_turtle",
      authorName: "느긋한 거북이",
      authorEmoji: "🐢",
      authorRealName: "김민준",
      authorStudentId: "30203",
      createdAt: new Date(Date.now() - 1000 * 60 * 90),
    },
    {
      id: "c11",
      boardId: "b6",
      title: "농도와 반응 속도 관계",
      content:
        "<p>농도와 반응 속도: 농도가 높아지면 단위 부피 안에 반응물 분자 수가 많아져 유효 충돌 횟수가 늘어나요. 묽은 HCl보다 진한 HCl이 마그네슘과 훨씬 빠르게 반응하는 것도 이 이유예요.</p>",
      imageUrl: null,
      authorId: "sample_dolphin",
      authorName: "재빠른 돌고래",
      authorEmoji: "🐬",
      authorRealName: "정다은",
      authorStudentId: "30204",
      createdAt: new Date(Date.now() - 1000 * 60 * 75),
    },
    // b7 — cl3 수업 안내
    {
      id: "c12",
      boardId: "b7",
      content:
        "<p>3학년 3반 수업 안내입니다. 이번 주는 산화 환원 반응과 전기 화학을 다룹니다. 다니엘 전지 원리를 먼저 이해하고, 모둠별로 탐구 결과를 카드에 올려 주세요.</p>",
      imageUrl: null,
      authorId: "teacher_01",
      authorName: "선생님",
      authorEmoji: "🧑‍🏫",
      authorRealName: "선생님",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 10),
    },
    // b8 — cl3 산화 환원 전지 탐구
    {
      id: "c13",
      boardId: "b8",
      title: "다니엘 전지 반쪽 반응식 정리",
      content:
        "<p>다니엘 전지 정리: 아연(Zn) 전극에서 Zn → Zn²⁺ + 2e⁻ (산화, 음극), 구리(Cu²⁺) 전극에서 Cu²⁺ + 2e⁻ → Cu (환원, 양극). 전자는 도선을 통해 음극→양극으로 이동하고, 이온은 염다리를 통해 이동해 전하 균형을 맞춰요.</p>",
      imageUrl: null,
      authorId: "sample_owl",
      authorName: "진지한 부엉이",
      authorEmoji: "🦉",
      authorRealName: "윤하은",
      authorStudentId: "30301",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4),
    },
    {
      id: "c14",
      boardId: "b8",
      title: "전지 기전력의 원리",
      content:
        "<p>전지 전압(기전력)이 왜 생기는지 이해했어요. 아연이 구리보다 표준 환원 전위가 낮아서 전자를 더 쉽게 내놓으려 해요. 이 전위 차이가 전압이 되는 거예요. 표준 전극 전위표를 쓰면 어느 금속이 산화될지 바로 알 수 있어요.</p>",
      imageUrl: null,
      authorId: "sample_penguin",
      authorName: "명랑한 펭귄",
      authorEmoji: "🐧",
      authorRealName: "박지후",
      authorStudentId: "30302",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3),
    },
    // b9 — cl3 화학 반응식 계수 맞추기
    {
      id: "c15",
      boardId: "b9",
      title: "에탄올 연소 반응식 계수 맞추기",
      content:
        "<p>에탄올 연소 반응식 계수 맞추기: C₂H₅OH + O₂ → CO₂ + H₂O. 단계: ①C:2개→CO₂ 2개 ②H:6개→H₂O 3개 ③O 오른쪽=4+3=7, O₂는 3.5개→분수 제거해 전체 ×2: 2C₂H₅OH + 6O₂ → 4CO₂ + 6H₂O</p>",
      imageUrl: null,
      authorId: "sample_otter",
      authorName: "호기심 많은 수달",
      authorEmoji: "🦦",
      authorRealName: "최하준",
      authorStudentId: "30303",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: "c16",
      boardId: "b9",
      title: "메테인 연소 반응식 계수 맞추기",
      content:
        "<p>메테인 연소 CH₄ + 2O₂ → CO₂ + 2H₂O 를 단계별로: C 1→CO₂ 1, H 4→H₂O 2, O 오른쪽=2+2=4→O₂ 2개. 탄소와 수소부터 맞추고 산소를 나중에 조정하는 순서를 쓰면 거의 모든 연소 반응식을 빠르게 풀 수 있어요.</p>",
      imageUrl: null,
      authorId: "sample_fox",
      authorName: "엉뚱한 여우",
      authorEmoji: "🦊",
      authorRealName: "이서연",
      authorStudentId: "30304",
      createdAt: new Date(Date.now() - 1000 * 60 * 60 * 1),
    },
  ],
  // KWL 항목 — 수업 단위(classId + userId + date)로 1개
  kwl: [],
  attendanceRecords: [],
  seatLayouts: [],
  groupAssignments: [],
};

// 데모 모드 키워드 (id + 이름 + 순서)
mock.keywords = DEFAULT_KEYWORDS.map((name, i) => ({
  id: `k${i}`,
  name,
  order: i,
}));
// 데모 KWL 기록 — 교사 대시보드에서 학생별 KWL 조회를 미리 볼 수 있게
// 샘플 학생 몇 명에게 최근 며칠치 항목을 심어 둡니다(데모 모드 전용).
const _kwlDate = (back) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return todayDateKey(d);
};
mock.kwl = [
  { id: "kwl_s1", classId: "cl1", userId: "sample_turtle", date: _kwlDate(3), K: "이온 결합을 배웠다", W: "공유 결합과 무엇이 다를까?", L: "전자를 주고받으면 이온, 함께 쓰면 공유 결합이다.", S: "금속 결합은 어떻게 다를까?", answers: { know: "이온 결합을 배웠다", want: "공유 결합과 무엇이 다를까?", learned: "전자를 주고받으면 이온, 함께 쓰면 공유 결합이다.", still: "금속 결합은 어떻게 다를까?" }, authorName: "느긋한 거북이", authorEmoji: "🐢", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 70) },
  { id: "kwl_s2", classId: "cl1", userId: "sample_turtle", date: _kwlDate(1), K: "산은 H+를 낸다", W: "중화 반응은 어떤 비율로 일어날까?", L: "산과 염기가 반응하면 물과 염이 생긴다.", S: "약산과 강산의 차이가 더 궁금하다.", answers: { know: "산은 H+를 낸다", want: "중화 반응은 어떤 비율로 일어날까?", learned: "산과 염기가 반응하면 물과 염이 생긴다.", still: "약산과 강산의 차이가 더 궁금하다." }, authorName: "느긋한 거북이", authorEmoji: "🐢", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 26) },
  { id: "kwl_s3", classId: "cl1", userId: "sample_fox", date: _kwlDate(2), K: "원소 기호 몇 개", W: "주기율표 규칙이 궁금", L: "같은 족은 성질이 비슷하다.", S: "전이 금속은 왜 성질이 다양할까?", answers: { know: "원소 기호 몇 개", want: "주기율표 규칙이 궁금", learned: "같은 족은 성질이 비슷하다.", still: "전이 금속은 왜 성질이 다양할까?" }, authorName: "재빠른 여우", authorEmoji: "🦊", createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48) },
];

let mockSeq = 1;
// 다른 모듈은 이 값을 ++ 할 수 없습니다(ES 모듈의 import는 읽기 전용) — 이 함수로 올립니다.
export function nextMockSeq() {
  return ++mockSeq;
}
export const mockListeners = {
  questions: new Set(),
  notices: new Set(),
  keywords: new Set(),
  answers: new Map(), // questionId -> Set(callback)
  classes: new Set(),
  studyBoards: new Set(),
  studyCards: new Map(), // boardId -> Set(callback)
  kwl: new Map(),        // `${classId}_${date}` | `${classId}_*` -> Set(callback)
  questionSignals: new Map(), // classId -> Set(callback)
  attendanceRecords: new Map(), // classId -> Set(callback)
  seatLayouts: new Map(), // `${classId}_${layoutId}` -> Set(callback)
  groupAssignments: new Map(), // classId -> Set(callback)
};

export function notify(set, data) {
  set.forEach((cb) => cb([...data]));
}

// 데모 전용 — authorId가 "__me__"인 샘플을 현재 접속자(나)의 것으로 치환합니다.
// 세션마다 uid가 랜덤이라 정적 데이터에 고정할 수 없어, 읽는 시점에 입혀 줍니다.
// (서버 렌더링 중에는 접속자 정보가 없으므로 그대로 둡니다.)
export function personalizeDemo(list) {
  if (typeof window === "undefined") return list;
  const me = getCurrentUser();
  return list.map((q) => {
    if (q.authorId !== "__me__") return q;
    const mine = {
      ...q,
      authorId: me.uid,
      authorName: me.displayName,
      authorEmoji: me.emoji,
      authorRealName: me.realName,
    };
    if (q.reflection && q.reflection.authorId === "__me__") {
      mine.reflection = {
        ...q.reflection,
        authorId: me.uid,
        authorName: me.displayName,
        authorEmoji: me.emoji,
      };
    }
    return mine;
  });
}

// 질문 목록 구독자에게 알림 — 데모에서는 "내 것" 샘플을 접속자 기준으로 치환
export function notifyQuestions() {
  notify(
    mockListeners.questions,
    personalizeDemo(sortByNewest(mock.questions))
  );
}

// 데모 전용 — 공부방 카드의 "__me__" 표식을 현재 접속자(나)의 것으로 치환합니다.
export function personalizeCards(list) {
  if (typeof window === "undefined") return list;
  const me = getCurrentUser();
  return list.map((c) =>
    c.authorId === "__me__"
      ? {
          ...c,
          authorId: me.uid,
          authorName: me.displayName,
          authorEmoji: me.emoji,
          authorRealName: me.realName,
          authorStudentId: me.studentId ?? null,
        }
      : c
  );
}

export function sortByNewest(arr) {
  return [...arr].sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));
}

export function sortByOldest(arr) {
  return [...arr].sort((a, b) => toDate(a.createdAt) - toDate(b.createdAt));
}

// 반 목록 정렬 — 교사가 '반 관리하기'에서 드래그로 정한 순서(order)를 따르고,
// order가 없는(드래그로 손댄 적 없는 옛 반) 반은 만든 순으로 뒤에 붙습니다.
export function sortByClassOrder(arr) {
  return [...arr].sort((a, b) => {
    const ao = a.order;
    const bo = b.order;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (ao == null && bo != null) return 1;
    return toDate(a.createdAt) - toDate(b.createdAt);
  });
}
