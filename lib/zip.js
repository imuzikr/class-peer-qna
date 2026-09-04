// =============================================================
// 아주 작은 ZIP 만들기 — .xlsx를 손으로 짜기 위한 최소한의 도구
// -------------------------------------------------------------
// .xlsx는 사실 XML 몇 장을 담은 ZIP 파일입니다. 그 ZIP을 만들려고
// 라이브러리(JSZip 등)를 넣기에는 하는 일에 비해 무겁습니다 — 출석부·활동
// 자료는 몇십 KB짜리 표 하나뿐이라, 압축 없이 그대로 담는(store) ZIP이면
// 충분합니다.
//
// **압축하지 않습니다(method 0).** 압축은 deflate 구현이 필요한데,
// 브라우저의 CompressionStream은 비동기라 코드가 복잡해지고 옛 사파리에는
// 없습니다. 표 한 장이 커야 100KB 남짓이라 줄여서 얻는 것이 없습니다.
//
// 규격: PKZIP APPNOTE 4.3 — 로컬 헤더 / 중앙 디렉터리 / 끝 기록(EOCD).
// 이름은 UTF-8로 쓰고 플래그에 그 표시(0x0800)를 켭니다.
// =============================================================

// CRC-32 (IEEE 802.3) — ZIP 항목마다 하나씩 필요합니다.
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// 파일 시각을 DOS 형식으로 — ZIP은 1980년 기준의 2바이트 두 개를 씁니다.
// (2초 단위라 초는 반으로 나눕니다)
function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
}
function dosDate(d) {
  const year = Math.max(1980, d.getFullYear());
  return (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
}

// entries: [{ name, text }] — 이름은 zip 안의 경로("xl/workbook.xml")
export function zipBlob(entries, { type = "application/zip", now = new Date() } = {}) {
  const enc = new TextEncoder();
  const time = dosTime(now);
  const date = dosDate(now);

  const parts = [];       // 로컬 헤더 + 자료
  const central = [];     // 중앙 디렉터리 항목
  let offset = 0;

  entries.forEach((e) => {
    const nameBytes = enc.encode(e.name);
    const data = typeof e.text === "string" ? enc.encode(e.text) : e.text;
    const sum = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);  // 로컬 파일 헤더 표시
    local.setUint16(4, 20, true);          // 풀려면 필요한 버전 2.0
    local.setUint16(6, 0x0800, true);      // 이름이 UTF-8
    local.setUint16(8, 0, true);           // 압축 방식 0 = 그대로 담기
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, sum, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);          // 덧붙임 없음
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);     // 중앙 디렉터리 표시
    cd.setUint16(4, 20, true);             // 만든 버전
    cd.setUint16(6, 20, true);             // 풀려면 필요한 버전
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, time, true);
    cd.setUint16(14, date, true);
    cd.setUint32(16, sum, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true);             // 덧붙임
    cd.setUint16(32, 0, true);             // 주석
    cd.setUint16(34, 0, true);             // 디스크 번호
    cd.setUint16(36, 0, true);             // 속성(내부)
    cd.setUint32(38, 0, true);             // 속성(외부)
    cd.setUint32(42, offset, true);        // 이 항목의 로컬 헤더 위치
    central.push(new Uint8Array(cd.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  });

  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);      // 끝 기록 표시
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);         // 중앙 디렉터리 시작 위치
  end.setUint16(20, 0, true);

  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type });
}
