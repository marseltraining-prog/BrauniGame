// cast.js — герои «Хлебной карты» в пикселях: маленькие фигуры для сцен и портреты 48×48.
(function () {
  const HAIR = {
    hero: ['#4a3024', '#2f1d17', '#7a5238'],
    grey: ['#c9c4bc', '#9a948c', '#eeeae2'],
    dark: ['#3a2622', '#22161a', '#5e4034'],
    black: ['#241c24', '#141018', '#46384a'],
    auburn: ['#8a4a2e', '#62311e', '#b8703f'],
    blond: ['#d8b36a', '#a8803e', '#f0d898'],
    chest: ['#6a4028', '#4a2a1a', '#8e5a38'],
  };
  const CAST = {
    hero: { name: 'Герой-бариста', skin: 0, hair: HAIR.hero, hairStyle: 'messy', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], pants: ['#2e4570', '#1f3052'], shoes: ['#3a2a2a', '#241a1a'],
      p: { skin: 0, hair: HAIR.hero, hairStyle: 'messy', top: ['#f5efe3', '#d6ccb9'], apron: ['#c46f17', '#94500b'], bg: ['#f4dfc2', '#ecd0aa'] } },
    rashid: { name: 'Рашид Хайруллин', skin: 1, hair: HAIR.grey, hairStyle: 'baker', hat: ['#fbf6ec', '#d9d0c0', '#ffffff'], top: ['#f5efe3', '#d6ccb9'], apron: ['#6b4a2e', '#4a3220'], pants: ['#4a4a55', '#35353e'], shoes: ['#3a2a2a', '#241a1a'], mustache: '#b8b2aa', brows: true,
      p: { skin: 1, hair: HAIR.grey, hairStyle: 'baker', hat: ['#fbf6ec', '#d9d0c0', '#ffffff'], top: ['#f5efe3', '#d6ccb9'], apron: ['#6b4a2e', '#4a3220'], mustache: '#bdb6ad', brows: true, browc: '#8f8980', age: true, bg: ['#efe3cf', '#e2d2b8'] } },
    gulya: { name: 'Гуля Сафина', skin: 0, hair: HAIR.dark, hairStyle: 'bandana', hat: ['#c0412d', '#8f2c20', '#e2705a', '#f5efe3'], top: ['#f5efe3', '#d6ccb9'], apron: ['#3f7d5a', '#2d5e44'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'],
      p: { skin: 0, hair: HAIR.dark, hairStyle: 'bandana', hat: ['#c0412d', '#8f2c20', '#e2705a', '#f5efe3'], top: ['#f5efe3', '#d6ccb9'], apron: ['#3f7d5a', '#2d5e44'], eyec: '#4a2a18', lips: '#b0503f', bg: ['#e3efe4', '#cfe3d4'] } },
    oleg: { name: 'Олег Кравцов', skin: 0, hair: HAIR.dark, hairStyle: 'neat', top: ['#6b6a73', '#4f4e57', '#8f8d94'], coat: true, pants: ['#2a2a33', '#1c1c24'], shoes: ['#1c1418', '#100c10'], beard: '#3a2622',
      p: { skin: 0, hair: ['#3b2e2a', '#241a18', '#5a4640'], hairStyle: 'neat', top: ['#6b6a73', '#4f4e57'], collar: 'shirt', tie: '#3b4a6b', beard: ['#5a4640', 0.22], eyec: '#3a4a5a', bg: ['#e7dfee', '#d8cce4'] } },
    elvira: { name: 'Эльвира Ахметова', skin: 0, hair: HAIR.black, hairStyle: 'bob', top: ['#2e4570', '#1f3052'], pants: ['#1f3052', '#15223c'], shoes: ['#1c1418', '#100c10'],
      p: { skin: 0, hair: HAIR.black, hairStyle: 'bob', top: ['#2e4570', '#1f3052'], collar: 'shirt', tie: '#f5efe3', earring: '#e3b341', lips: '#b04a4a', bg: ['#dbe7ee', '#c6d8e4'] } },
    mama: { name: 'Мама Фания', skin: 0, hair: HAIR.auburn, hairStyle: 'bun', top: ['#7d5a8e', '#5c3f6d'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'],
      p: { skin: 0, hair: HAIR.auburn, hairStyle: 'bun', top: ['#7d5a8e', '#5c3f6d'], collar: 'v', age: true, lips: '#a8504a', bg: ['#ece2f0', '#dccde4'] } },
    sania: { name: 'Бабушка Сания', skin: 1, hair: HAIR.grey, hairStyle: 'scarf', hat: ['#8a2f3a', '#62202a', '#b0505a', '#a8404a'], top: ['#3f6b5a', '#2d4e42'], pants: ['#3f6b5a', '#2d4e42'], shoes: ['#3a2a2a', '#241a1a'],
      p: { skin: 1, hair: HAIR.grey, hairStyle: 'scarf', hat: ['#8a2f3a', '#62202a', '#b0505a', '#e3b341'], top: ['#3f6b5a', '#2d4e42'], age: true, blush: true, bg: ['#f3e6c4', '#e8d4a4'] } },
    semyon: { name: 'Семён Аркадьевич', skin: 0, hair: HAIR.grey, hairStyle: 'bald', top: ['#8a6a4a', '#6a4e36'], pants: ['#5a5a66', '#40404a'], shoes: ['#3a2a2a', '#241a1a'], glasses: '#6a5050',
      p: { skin: 0, hair: HAIR.grey, hairStyle: 'bald', top: ['#8a6a4a', '#6a4e36'], collar: 'shirt', tie: '#8f2c20', glasses: '#2a1a1c', age: true, beard: ['#c9c4bc', 0.3], bg: ['#efe6d6', '#e2d4bc'] } },
    // гости очереди
    g1: { skin: 0, hair: HAIR.blond, hairStyle: 'long', top: ['#7d5a8e', '#5c3f6d'], pants: ['#2e4570', '#1f3052'], shoes: ['#f5efe3', '#d6ccb9'] },
    g2: { skin: 2, hair: HAIR.black, hairStyle: 'beanie', hat: ['#3b8796', '#235f6b', '#6cc0cf'], top: ['#3f7d5a', '#2d5e44'], pants: ['#4a4a55', '#35353e'], shoes: ['#3a2a2a', '#241a1a'] },
    g3: { skin: 1, hair: HAIR.chest, hairStyle: 'curly', top: ['#c0412d', '#8f2c20'], pants: ['#2a2a33', '#1c1c24'], shoes: ['#f5efe3', '#d6ccb9'] },
    g4: { skin: 0, hair: HAIR.auburn, hairStyle: 'bob', top: ['#e3b341', '#b88a24'], pants: ['#3a3a48', '#282833'], shoes: ['#6b4a2e', '#4a3220'] },
  };
  window.CAST = CAST;
})();
