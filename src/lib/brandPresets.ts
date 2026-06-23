// Presets de marcas por categoria (editáveis pelo lojista em Estoque > Marcas).
export const BRAND_PRESETS: Record<string, string[]> = {
  "Smartphones": ["Apple","Samsung","Xiaomi","Motorola","Realme","POCO","Infinix","Honor","Asus","Nokia"],
  "Smartwatches": ["Apple Watch","Samsung Galaxy Watch","Xiaomi Watch","Amazfit","Huawei Watch","Garmin","Realme Watch","Haylou","Zeblaze","Colmi"],
  "Fones de Ouvido": ["Apple AirPods","JBL","Xiaomi","Samsung","Baseus","QCY","Edifier","H'Maston","A'Gold","Inova"],
  "Caixas de Som": ["JBL","Mondial","LG","Sony","Philco","Xiaomi","H'Maston","A'Gold","Inova","Lenoxx"],
  "Power Banks": ["Baseus","Xiaomi","Geonav","Pineng","H'Rebos","H'Maston","A'Gold","Inova","Altomex","Kaidi"],
  "Carregadores": ["Baseus","Xiaomi","Samsung","Apple","Kaidi","H'Rebos","H'Maston","Inova","A'Gold","X-One"],
  "Cabos": ["Baseus","X-One","GShield","Apple","Samsung","H'Rebos","H'Maston","Inova","A'Gold","Kaidi"],
  "Capas e Proteções": ["GShield","X-One","H'Maston","A'Gold","Baseus","Spigen","Gorila Shield","OtterBox","Ringke","ESR"],
  "Películas": ["GShield","X-One","H'Maston","A'Gold","Gorila Shield","Baseus","H'Rebos","Inova","3MK","ESR"],
  "Memórias e Armazenamento": ["SanDisk","Kingston","Samsung","Lexar","Adata","Western Digital","Crucial","Hiksemi","Multilaser","XrayDisk"],
};

export const BRAND_CATEGORIES = Object.keys(BRAND_PRESETS);