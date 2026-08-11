// Figure/spatial-reasoning questions para sa CSE Analytical Ability.
// Ang mga pigura ay iginuhit gamit ang monospace:
//   # = may-kulay na kahon, . = walang laman
// May field na `figure` para ipakita ng frontend sa loob ng monospace <pre> block.

export const figAnalytical = [
  // ===== Pagbilang ng mga kahon =====
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura A?", figure: `###
#..
###`, options: ["6", "7", "8", "9"], answer: 1, topic: "Analytical", explanation: "Unang hanay: 3, gitna: 1, ibaba: 3 → 3+1+3 = 7.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura B?", figure: `.#.
###
.#.`, options: ["4", "5", "6", "7"], answer: 1, topic: "Analytical", explanation: "1 + 3 + 1 = 5 ang may-kulay na kahon.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura C?", figure: `..#
..#
..#`, options: ["2", "3", "4", "5"], answer: 1, topic: "Analytical", explanation: "Tatlong kahon sa huling kolum: 3.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura D?", figure: `#...
####
#...
#...`, options: ["7", "8", "9", "10"], answer: 0, topic: "Analytical", explanation: "Kaliwa kolum: 4; kasama ang 3 gitnang kahon sa pangalawang hanay → 4+3 = 7.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura E?", figure: `.##.
.##.
.##.
.##.`, options: ["6", "7", "8", "9"], answer: 2, topic: "Analytical", explanation: "2 bawat hanay × 4 na hanay = 8.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura F?", figure: `###
#.#
###`, options: ["7", "8", "9", "10"], answer: 1, topic: "Analytical", explanation: "Itaas: 3, gitna: 2, ibaba: 3 → 3+2+3 = 8.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura G?", figure: `#.#
.#.
#.#`, options: ["4", "5", "6", "7"], answer: 1, topic: "Analytical", explanation: "Korner: 2+2 = 4, gitna: 1 → 4+1 = 5.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura H?", figure: `#..
##.
###
####`, options: ["9", "10", "11", "12"], answer: 1, topic: "Analytical", explanation: "1 + 2 + 3 + 4 = 10 kahon (hagdan-hagdang pattern).", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura I?", figure: `#..
##.
###`, options: ["5", "6", "7", "8"], answer: 1, topic: "Analytical", explanation: "1 + 2 + 3 = 6 kahon.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura J?", figure: `###
 ##`, options: ["4", "5", "6", "7"], answer: 1, topic: "Analytical", explanation: "Itaas: 3, ibaba: 2 → 3+2 = 5.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura K?", figure: `##
###
##`, options: ["6", "7", "8", "9"], answer: 1, topic: "Analytical", explanation: "2 + 3 + 2 = 7 na kahon.", icon: "🔢" },
  { q: "Ilang may-kulay na kahon (#) ang nasa Pigura L?", figure: `#..
.#.
..#`, options: ["2", "3", "4", "5"], answer: 1, topic: "Analytical", explanation: "Diagonal: 1 + 1 + 1 = 3 kahon.", icon: "🔢" },

  // ===== Series / pattern =====
  { q: "Ano ang susunod na posisyon ng itim na kahon sa 2×2 pattern?", figure: `[1]    [2]    [3]    [4]    [5]
#.     .#     ..     ..     ?
..     ..     .#     #.`, options: ["Kaliwang-itaas", "Kanan-itaas", "Kanan-ibaba", "Kaliwang-ibaba"], answer: 0, topic: "Analytical", explanation: "Paikot na direksyon (clockwise): kaliwang-itaas → kanan-itaas → kanan-ibaba → kaliwang-ibaba → balik sa kaliwang-itaas.", icon: "🔄" },
  { q: "Ano ang susunod na posisyon ng itim na kahon sa 3×3 pattern?", figure: `[1]     [2]     [3]     [4]     [5]     [6]
#..     .#.     ..#     ...     ...     ?
...     ...     ...     ..#     ...     ...
...     ...     ...     ...     ..#`, options: ["Babang-gitna", "Babang-kanan", "Gitnang-kanan", "Pamagitan-kanan"], answer: 0, topic: "Analytical", explanation: "Gumagalaw nang pakanan sa hangganan ng 3×3 grid: pagkatapos ng babang-kanan, susunod ang babang-gitna.", icon: "🔄" },
  { q: "Ano ang susunod na pigura sa pattern?", figure: `[1]     [2]     [3]     [4]     [5]
.#.     ...     .#.     ...     ?
###     .#.     ###     .#.
.#.     ...     .#.     ...`, options: ["May plus (+) na 5 kahon", "Walang laman", "Hugis X", "Diagonal na 3 kahon"], answer: 0, topic: "Analytical", explanation: "Lumalabas ang plus shape sa mga odd step (1, 3, 5) at naglalaho sa even step (2, 4). Kaya sa [5] may plus ulit.", icon: "➕" },

  // ===== Odd one out =====
  { q: "Aling pigura ang HINDI kabilang sa pangkat (Set 1)?", figure: `[A]     [B]     [C]     [D]
#.      #.      #.      #.
#.      #.      #.      .#`, options: ["[A]", "[B]", "[C]", "[D]"], answer: 3, topic: "Analytical", explanation: "Ang [A], [B], at [C] ay mga patayong hanay sa kaliwang kolum; ang [D] ay diagonal/hindi patayo.", icon: "🔍" },
  { q: "Aling pigura ang HINDI kabilang sa pangkat (Set 2)?", figure: `[A]     [B]     [C]     [D]
#       #       #       ###
#       #       #
#       #       #`, options: ["[A]", "[B]", "[C]", "[D]"], answer: 3, topic: "Analytical", explanation: "Ang [A], [B], at [C] ay mga patayong linya; ang [D] ay pahalang (horizontal).", icon: "🔍" },
  { q: "Aling pigura ang HINDI kabilang sa pangkat (Set 3)?", figure: `[A]     [B]     [C]     [D]
#.      #.      #.      .#
#.      #.      #.      .#
#.      #.      #.      .#`, options: ["[A]", "[B]", "[C]", "[D]"], answer: 3, topic: "Analytical", explanation: "Ang [A], [B], at [C] ay may itim na kahon sa kaliwang kolum; ang [D] ay nasa kanang kolum.", icon: "🔍" },

  // ===== Matching / transformation =====
  { q: "Alin ang kapareho ng [A]?", figure: `[A]     [1]     [2]     [3]     [4]
#.      #.      .#      #.      .#
#.      #.      #.      .#      .#`, options: ["[1]", "[2]", "[3]", "[4]"], answer: 0, topic: "Analytical", explanation: "Ang [A] at [1] ay parehong patayong hanay sa kaliwang kolum.", icon: "🪞" },
  { q: "Alin ang salamin (mirror) ng [A]?", figure: `[A]     [1]     [2]     [3]     [4]
.#      .#      #.      ..      ##
.#      .#      #.      ##      ..`, options: ["[1]", "[2]", "[3]", "[4]"], answer: 1, topic: "Analytical", explanation: "Ang salamin (left-right flip) ng kanang-kolum na [A] ay kaliwang-kolum — ang [2].", icon: "🪞" },
  { q: "Kapag iniikot 90° pakanan (clockwise) ang [A], aling pigura ang makukuha?", figure: `[A]     [1]     [2]     [3]     [4]
##      .#      #.      #.      ##
#.      ##      #.      ##      .#`, options: ["[1]", "[2]", "[3]", "[4]"], answer: 1, topic: "Analytical", explanation: "Ang [A] (# # sa itaas, # sa kaliwa) ay nagiging kaliwang-kolum (vertical) kapag iniikot nang 90° pakanan — ito ang [2].", icon: "🔄" },
  { q: "Kung iniikot 180°, aling pigura ang makukuha mula sa [A]?", figure: `[A]     [1]     [2]     [3]     [4]
#.      #.      ##      .#      ..
##      ##      #.      ##      ##`, options: ["[1]", "[2]", "[3]", "[4]"], answer: 2, topic: "Analytical", explanation: "Ang 180° rotation ng [A] (#. / ##) ay nagiging .# / ## — ito ang [3].", icon: "🔄" },
  { q: "Analogy: Ano ang bubuo sa pattern?", figure: `[A]     [B]     [C]     [?]
#.      ##      ..      ..
..      ..      #.      ?`, options: ["Punong bababang-hanay", "Punong itaas-hanay", "Isang kahon sa kaliwa", "Walang pagbabago"], answer: 0, topic: "Analytical", explanation: "Sa [A]→[B], dinagdag ang kanang kahon sa itaas na hanay. Kaya sa [C]→[?], dinagdag ang kanang kahon sa ibabang hanay → puno ang ibaba.", icon: "🧩" },
  { q: "Analogy: Ano ang bubuo sa [?]?", figure: `[A]     [B]     [C]     [?]
.#      ..      #.      ..
..      .#      ..      ?`, options: ["Kaliwa-ibaba", "Kanan-ibaba", "Kaliwa-itaas", "Kanan-itaas"], answer: 0, topic: "Analytical", explanation: "Sa [A]→[B], bumaba ang kahon sa parehong kanang kolum. Kaya sa [C]→[?], bababa ang kahon sa kaliwang kolum → kaliwa-ibaba.", icon: "⬇️" },
  { q: "Kung sa bawat hakbang ay dumadagdag ng 1 kahon, ilang kahon ang nasa ikalimang pigura?", figure: `[1]     [2]     [3]     [4]
#       ##      ###     ####`, options: ["4", "5", "6", "7"], answer: 1, topic: "Analytical", explanation: "1, 2, 3, 4 → susunod ay 5 kahon (ika-5 pigura).", icon: "🔢" },

  // ===== Matrix completion =====
  { q: "Sa matrix sa ibaba, ano ang bubuo sa [?]?", figure: `[1]     [2]
#.      ##
..      ..

[3]     [?]
..
#.`, options: ["Punong ibabang-hanay", "Punong itaas-hanay", "Isang kahon sa kaliwa", "Kanan-itaas lang"], answer: 0, topic: "Analytical", explanation: "Pattern sa bawat hanay ng matrix: idinadagdag ang kanang kahon. Ang [1] (#.) ay nagiging [2] (##); kaya ang [3] ay dapat maging punong ibaba (## sa ibabang hanay).", icon: "🧩" },
  { q: "Ano ang kabuuang bilang ng mga kahon na kailangan para makumpleto ang 3×3 grid?", figure: `#..
.#.
..#`, options: ["4", "5", "6", "7"], answer: 2, topic: "Analytical", explanation: "May 3 kahon na. Para maka-9 (3×3), kailangan ng 9 − 3 = 6 kahon pa.", icon: "📐" },
  { q: "Kung ang pattern ay dalawang kahon bawat hakbang, ilang kahon ang mayroon sa ikaapat na pigura?", figure: `[1]     [2]     [3]
##      ####    ######`,
  options: ["8", "10", "12", "14"], answer: 0, topic: "Analytical", explanation: "2, 4, 6 → susunod (ika-4) ay 8 kahon (dagdag ng 2 bawat hakbang).", icon: "📈" },
  { q: "Ano ang susunod na pigura kung ang bilang ng kahon ay 1, 4, 9, 16, ___?", figure: `[1]     [2]     [3]     [4]
#       ##      ###     ####
        ##      ###     ####
                ###     ####
                        ####`, options: ["5×5 na 25 kahon", "4×4 na 16 kahon", "6×6 na 36 kahon", "3×3 na 9 kahon"], answer: 0, topic: "Analytical", explanation: "Perpektong parisukat: 1², 2², 3², 4² → susunod ay 5² = 25 kahon (5×5).", icon: "📐" },
  { q: "Ilang kahon ang kulang para ang hugis ay maging 4×4 na parisukat?", figure: `###
###
###`, options: ["4", "5", "6", "7"], answer: 2, topic: "Analytical", explanation: "Ang 3×3 ay may 9 kahon. Ang 4×4 ay may 16. Kulang: 16 − 9 = 7 kahon.", icon: "📐" },
  { q: "Aling pigura ang susunod sa pattern ng pagitan ng hugis at puwang?", figure: `[1]     [2]     [3]     [4]
###     #.#     ###     #.#     ?
#.#     ###     #.#     ###     ?`, options: ["### / #.#", "#.# / ###", "### / ###", "#.# / #.#"], answer: 0, topic: "Analytical", explanation: "Alternating: solid (###) at gitnang-puwang (#.#). Pagkatapos ng #.# / ###, dumarating muli ang ### / #.#.", icon: "🔄" },
];

// I-attach ang image path sa bawat figure question para sa frontend rendering.
figAnalytical.forEach((q, i) => {
  q.image = `/figures/fig-${String(i + 1).padStart(2, '0')}.svg`;
});