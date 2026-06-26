// Categorias inteligentes para o onboarding Business (Angola).
// Categoria selecionável → subcategorias dependentes. "Outros" abre um campo
// livre "Descreva a categoria".

export const CATEGORIES: string[] = [
  'Alimentação e bebidas',
  'Retalho',
  'Farmácia e saúde',
  'Serviços',
  'Transportes',
  'Educação',
  'Beleza e estética',
  'Tecnologia',
  'Oficinas e peças',
  'Hotelaria e alojamento',
  'Entretenimento',
  'Outros',
];

export const OUTROS = 'Outros';

export const SUBCATEGORIES: Record<string, string[]> = {
  'Alimentação e bebidas': ['Restaurante', 'Cantina', 'Pastelaria', 'Bar', 'Take-away', 'Mercearia'],
  Retalho: ['Loja de roupa', 'Loja alimentar', 'Loja de conveniência', 'Supermercado', 'Peças e acessórios'],
  'Farmácia e saúde': ['Farmácia', 'Clínica', 'Laboratório', 'Óptica'],
  Serviços: ['Serviços profissionais', 'Limpeza', 'Reparações', 'Consultoria', 'Lavandaria'],
  Transportes: ['Táxi', 'Transporte de mercadorias', 'Aluguer de viaturas', 'Logística'],
  Educação: ['Escola', 'Explicações', 'Formação profissional', 'Creche'],
  'Beleza e estética': ['Salão de cabeleireiro', 'Barbearia', 'Estética', 'Manicure / Pedicure'],
  Tecnologia: ['Loja de informática', 'Reparação de telemóveis', 'Software / Apps', 'Serviços digitais'],
  'Oficinas e peças': ['Oficina auto', 'Peças auto', 'Lavagem de viaturas', 'Bate-chapa e pintura'],
  'Hotelaria e alojamento': ['Hotel', 'Pensão / Hospedaria', 'Guest house', 'Arrendamento turístico'],
  Entretenimento: ['Eventos', 'Discoteca / Bar', 'Aluguer de equipamento', 'Produção musical'],
};

/** Subcategorias de uma categoria (vazio para "Outros" ou categoria inválida). */
export function subcategoriasDe(categoria: string): string[] {
  return SUBCATEGORIES[categoria] ?? [];
}

// Volume mensal estimado (faixas em Kz) — usado para risco/limites no MVP.
export const VOLUME_FAIXAS: string[] = [
  'Menos de 100.000 Kz',
  '100.000 – 500.000 Kz',
  '500.000 – 2.000.000 Kz',
  '2.000.000 – 10.000.000 Kz',
  'Mais de 10.000.000 Kz',
];
