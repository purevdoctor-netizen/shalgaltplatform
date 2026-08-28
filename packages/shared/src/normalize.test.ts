import { describe, expect, it } from 'vitest';
import {
  computeStudentKey,
  fnv1a32,
  matchesAccepted,
  normalizeName,
  normalizeText,
  sha256Hex,
  textEquals,
} from './normalize';

describe('normalizeText', () => {
  it('NFC нормчлол хийнэ', () => {
    // "é" — нэгдмэл (U+00E9) ба задарсан (e + U+0301) хэлбэр ижил болно
    expect(normalizeText('é')).toBe(normalizeText('é'));
  });

  it('эхлэл/төгсгөлийн зайг арилгана', () => {
    expect(normalizeText('   3/4   ')).toBe('3/4');
  });

  it('жижиг үсэг болгоно (кирилл орно)', () => {
    expect(normalizeText('ХОРЬ')).toBe('хорь');
    expect(normalizeText('ЗӨВ Хариулт')).toBe('зөв хариулт');
  });

  it('давтагдсан зайг нэг зай болгоно', () => {
    expect(normalizeText('гурав    дөрөв\t\tтав')).toBe('гурав дөрөв тав');
  });

  it('эхлэл/төгсгөлийн цэг, таслалыг хасна', () => {
    expect(normalizeText('20.')).toBe('20');
    expect(normalizeText('...хариулт,,,')).toBe('хариулт');
    expect(normalizeText('«3/4»')).toBe('3/4');
  });

  it('утга бүхий тэмдэгтийг хасахгүй', () => {
    expect(normalizeText('50%')).toBe('50%');
    expect(normalizeText('-5')).toBe('-5');
    expect(normalizeText('3/4')).toBe('3/4');
  });

  it('хоосон мөрийг хоосноор буцаана', () => {
    expect(normalizeText('   ')).toBe('');
    expect(normalizeText('...')).toBe('');
  });
});

describe('textEquals / matchesAccepted', () => {
  it('нормчлолын дараа тэнцүү текстийг таньна', () => {
    expect(textEquals('  20. ', '20')).toBe(true);
    expect(textEquals('Хорь', 'хорь')).toBe(true);
  });

  it('fuzzy харьцуулалт ХИЙХГҮЙ', () => {
    expect(textEquals('хорь', 'хори')).toBe(false);
    expect(textEquals('20', '21')).toBe(false);
  });

  it('хүлээн зөвшөөрөх жагсаалтаас олно', () => {
    expect(matchesAccepted(' 0.75 ', ['3/4', '0.75'])).toBe(true);
    expect(matchesAccepted('0,75', ['3/4', '0.75'])).toBe(false);
  });

  it('хоосон хариултыг зөв гэж үзэхгүй', () => {
    expect(matchesAccepted('   ', ['', '20'])).toBe(false);
  });
});

describe('normalizeName', () => {
  it('ё үсгийг е болгоно', () => {
    expect(normalizeName('Ёндон')).toBe('ендон');
    expect(normalizeName('Ёндон')).toBe(normalizeName('ендон'));
  });

  it('зай, том/жижиг үсгийг нормчилно', () => {
    expect(normalizeName('  БАТ   БОЛД ')).toBe('бат болд');
  });
});

describe('sha256Hex', () => {
  // FIPS 180-4 / NIST тест векторууд
  it('хоосон мөр', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('"abc"', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('448 битийн мессеж (хоёр блок болно)', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('896 битийн мессеж', () => {
    expect(
      sha256Hex(
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1');
  });

  it('UTF-8-аар кодчилно — кирилл "а" нь латин "a"-аас ялгаатай', () => {
    const cyrillic = sha256Hex('а'); // U+0430 → 2 байт (D0 B0)
    const latin = sha256Hex('a'); // U+0061 → 1 байт (61)
    expect(cyrillic).toMatch(/^[0-9a-f]{64}$/);
    expect(cyrillic).not.toBe(latin);
    expect(latin).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb');
  });

  it('55 ба 56 байтын хилийн тохиолдол (дүүргэлт)', () => {
    expect(sha256Hex('a'.repeat(55))).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('a'.repeat(56))).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex('a'.repeat(55))).not.toBe(sha256Hex('a'.repeat(56)));
    // NIST: 1,000,000 удаа "a" биш, харин 448-бит хилийн блок шилжилтийг шалгав
    expect(sha256Hex('a'.repeat(64))).toBe(
      'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb',
    );
  });
});

describe('computeStudentKey', () => {
  it('64 тэмдэгт hex буцаана', () => {
    expect(computeStudentKey('Дорж', 'Ану', '8а')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('зай, том/жижиг үсэг, ё-гээс хамаарахгүй', () => {
    const a = computeStudentKey('Дорж', 'Ану', '8а');
    const b = computeStudentKey('  ДОРЖ ', 'ану', '8А');
    expect(a).toBe(b);
  });

  it('өөр сурагчид өөр түлхүүр өгнө', () => {
    const a = computeStudentKey('Дорж', 'Ану', '8а');
    const b = computeStudentKey('Дорж', 'Ану', '8б');
    const c = computeStudentKey('Дорж', 'Анар', '8а');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('талбарын хилийг хольж андуурахгүй', () => {
    // "аб|в" ба "а|бв" ялгаатай байх ёстой
    expect(computeStudentKey('аб', 'в', 'г')).not.toBe(computeStudentKey('а', 'бв', 'г'));
  });
});

describe('fnv1a32', () => {
  it('детерминистик', () => {
    expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
  });

  it('32 битийн эерэг бүхэл тоо', () => {
    const value = fnv1a32('ямар нэг урт текст 12345');
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0xffffffff);
  });

  it('өөр орох утга өөр гаралт', () => {
    expect(fnv1a32('a')).not.toBe(fnv1a32('b'));
  });
});
