// Angola-first location data for the Business onboarding form.
// 18 províncias → municípios (dependentes) → sugestões de cidade/bairro/zona.
// As sugestões de cidade são apenas dicas (datalist) — texto livre é sempre
// permitido. Mantido como dados estáticos simples (sem dependências externas).

export const PROVINCIAS: string[] = [
  'Bengo',
  'Benguela',
  'Bié',
  'Cabinda',
  'Cuando Cubango',
  'Cuanza Norte',
  'Cuanza Sul',
  'Cunene',
  'Huambo',
  'Huíla',
  'Luanda',
  'Lunda Norte',
  'Lunda Sul',
  'Malanje',
  'Moxico',
  'Namibe',
  'Uíge',
  'Zaire',
];

// Municípios por província (principais; cobre todos os 18).
export const MUNICIPIOS: Record<string, string[]> = {
  Bengo: ['Caxito (Dande)', 'Ambriz', 'Bula Atumba', 'Dembos', 'Nambuangongo', 'Pango Aluquém'],
  Benguela: ['Benguela', 'Lobito', 'Catumbela', 'Baía Farta', 'Bocoio', 'Caimbambo', 'Chongorói', 'Cubal', 'Ganda', 'Balombo'],
  Bié: ['Cuíto', 'Andulo', 'Camacupa', 'Catabola', 'Chinguar', 'Chitembo', 'Cunhinga', 'Nharea', 'Cuemba'],
  Cabinda: ['Cabinda', 'Belize', 'Buco-Zau', 'Cacongo'],
  'Cuando Cubango': ['Menongue', 'Calai', 'Cuangar', 'Cuchi', 'Cuito Cuanavale', 'Dirico', 'Mavinga', 'Nancova', 'Rivungo'],
  'Cuanza Norte': ['Ndalatando (Cazengo)', 'Ambaca', 'Banga', 'Bolongongo', 'Cambambe', 'Golungo Alto', 'Gonguembo', 'Lucala', 'Quiculungo', 'Samba Cajú'],
  'Cuanza Sul': ['Sumbe', 'Porto Amboim', 'Amboim (Gabela)', 'Cassongue', 'Cela (Waku Kungo)', 'Conda', 'Ebo', 'Libolo (Calulo)', 'Mussende', 'Quibala', 'Quilenda', 'Seles'],
  Cunene: ['Ondjiva (Cuanhama)', 'Cahama', 'Cuangar', 'Curoca', 'Cuvelai', 'Namacunde', 'Ombadja'],
  Huambo: ['Huambo', 'Caála', 'Bailundo', 'Catchiungo', 'Ekunha', 'Londuimbali', 'Longonjo', 'Mungo', 'Chicala-Choloanga', 'Chinjenje', 'Ucuma'],
  Huíla: ['Lubango', 'Matala', 'Caconda', 'Caluquembe', 'Chibia', 'Chicomba', 'Chipindo', 'Cuvango', 'Gambos', 'Humpata', 'Jamba', 'Quilengues', 'Quipungo'],
  Luanda: ['Luanda', 'Belas', 'Cacuaco', 'Cazenga', 'Icolo e Bengo', 'Kilamba Kiaxi', 'Quiçama', 'Talatona', 'Viana'],
  'Lunda Norte': ['Dundo (Chitato)', 'Cambulo', 'Capenda-Camulemba', 'Caungula', 'Cuango', 'Cuilo', 'Lóvua', 'Lubalo', 'Lucapa', 'Xá-Muteba'],
  'Lunda Sul': ['Saurimo', 'Cacolo', 'Dala', 'Muconda'],
  Malanje: ['Malanje', 'Cacuso', 'Calandula', 'Cambundi-Catembo', 'Cangandala', 'Caombo', 'Cunda-Dia-Baze', 'Luquembo', 'Marimba', 'Massango', 'Mucari', 'Quela', 'Quirima'],
  Moxico: ['Luena (Moxico)', 'Alto Zambeze', 'Bundas', 'Camanongue', 'Cameia', 'Léua', 'Luau', 'Luacano', 'Lumeje', 'Cangumbe'],
  Namibe: ['Moçâmedes (Namibe)', 'Bibala', 'Camucuio', 'Tômbwa', 'Virei'],
  Uíge: ['Uíge', 'Negage', 'Alto Cauale', 'Ambuíla', 'Bembe', 'Buengas', 'Bungo', 'Damba', 'Macocola', 'Mucaba', 'Puri', 'Quimbele', 'Quitexe', 'Sanza Pombo', 'Songo', 'Zombo'],
  Zaire: ['Mbanza Kongo', 'Soyo', 'Cuimba', 'Nóqui', 'Nzeto', 'Tomboco'],
};

// Sugestões de cidade / bairro / zona por município (apenas dicas; texto livre).
// Cobertura forte para Luanda e principais centros; restante usa texto livre.
export const CIDADE_SUGESTOES: Record<string, string[]> = {
  Luanda: ['Ingombota', 'Maianga', 'Rangel', 'Samba', 'Sambizanga', 'Maculusso', 'Alvalade', 'Mutamba'],
  Talatona: ['Talatona', 'Benfica', 'Camama', 'Morro Bento', 'Lar do Patriota'],
  Belas: ['Kilamba', 'Camama', 'Vila de Belas', 'Ramiros', 'Futungo de Belas'],
  Viana: ['Viana', 'Zango', 'Capalanga', 'Estalagem', 'Vila Flor', 'Calumbo'],
  'Kilamba Kiaxi': ['Golf', 'Palanca', 'Sapú', 'Nova Vida'],
  Cacuaco: ['Cacuaco', 'Funda', 'Kikolo', 'Sequele', 'Quinguari'],
  Cazenga: ['Cazenga', 'Hoji ya Henda', 'Tala Hady', '11 de Novembro'],
  Lobito: ['Lobito', 'Canata', 'Compão', 'Caponte', 'Restinga'],
  Benguela: ['Benguela', 'Praia Morena', 'Calombotão', 'Cidade Alta'],
  Lubango: ['Lubango', 'Arimba', 'Tchioco', 'Nambambi', 'Comercial'],
  Huambo: ['Huambo', 'Cidade Baixa', 'Académico', 'São João'],
  'Cuíto': ['Cuíto', 'Bairro da Sé', 'Kunje'],
  Cabinda: ['Cabinda', 'Cabassango', 'Tchiowa', 'Amílcar Cabral'],
  'Moçâmedes (Namibe)': ['Moçâmedes', 'Saco Mar', 'Forte'],
};

/** Municípios de uma província (vazio se província inválida/não selecionada). */
export function municipiosDe(provincia: string): string[] {
  return MUNICIPIOS[provincia] ?? [];
}

/** Sugestões de cidade/bairro para um município (lista pode ser vazia). */
export function cidadesDe(municipio: string): string[] {
  return CIDADE_SUGESTOES[municipio] ?? [];
}
