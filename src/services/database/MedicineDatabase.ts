/**
 * Medicine Database Service
 * Searches for medicine composition, salt, and details
 * Uses OpenFDA API and local database
 */

export interface MedicineInfo {
  name: string;
  genericName: string;
  salt: string;
  composition: string[];
  manufacturer: string;
  strength: string;
  commonBrands: string[];
  warnings?: string[];
  sideEffects?: string[];
}

// Local Indian medicine database (can be expanded)
const INDIAN_MEDICINES_DB: Record<string, MedicineInfo> = {
  'amoxicillin': {
    name: 'Amoxicillin',
    genericName: 'Amoxicillin',
    salt: 'Amoxicillin trihydrate',
    composition: ['Amoxicillin 250mg/500mg'],
    manufacturer: 'Various',
    strength: '250mg, 500mg',
    commonBrands: ['Augmentin', 'Biomox', 'Amoxil', 'Acillin'],
  },
  'azithromycin': {
    name: 'Azithromycin',
    genericName: 'Azithromycin',
    salt: 'Azithromycin dihydrate',
    composition: ['Azithromycin 250mg/500mg'],
    manufacturer: 'Various',
    strength: '250mg, 500mg',
    commonBrands: ['Zithromax', 'Azee', 'Trupen', 'Azipar'],
  },
  'paracetamol': {
    name: 'Paracetamol',
    genericName: 'Acetaminophen/Paracetamol',
    salt: 'Paracetamol',
    composition: ['Paracetamol 500mg'],
    manufacturer: 'Various',
    strength: '500mg',
    commonBrands: ['Crocin', 'Dolo', 'Ibugesic', 'Cetafen'],
  },
  'ibuprofen': {
    name: 'Ibuprofen',
    genericName: 'Ibuprofen',
    salt: 'Ibuprofen',
    composition: ['Ibuprofen 400mg/600mg'],
    manufacturer: 'Various',
    strength: '400mg, 600mg',
    commonBrands: ['Brufen', 'Comfort', 'Ibugesic Plus', 'Nurofen'],
  },
  'aspirin': {
    name: 'Aspirin',
    genericName: 'Acetylsalicylic acid',
    salt: 'Acetylsalicylic acid',
    composition: ['Acetylsalicylic acid 75mg/150mg/300mg'],
    manufacturer: 'Various',
    strength: '75mg, 150mg, 300mg',
    commonBrands: ['Ecosprin', 'Deplatt', 'Aspicot', 'Cipla Aspirin'],
  },
  'metformin': {
    name: 'Metformin',
    genericName: 'Metformin hydrochloride',
    salt: 'Metformin HCl',
    composition: ['Metformin HCl 500mg/850mg/1000mg'],
    manufacturer: 'Various',
    strength: '500mg, 850mg, 1000mg',
    commonBrands: ['Glucophage', 'Glycomet', 'Diabamyl', 'Formit'],
  },
  'lisinopril': {
    name: 'Lisinopril',
    genericName: 'Lisinopril',
    salt: 'Lisinopril dihydrate',
    composition: ['Lisinopril 2.5mg/5mg/10mg'],
    manufacturer: 'Various',
    strength: '2.5mg, 5mg, 10mg',
    commonBrands: ['Zestril', 'Lisipril', 'Zestoril', 'Lipicard'],
  },
  'atorvastatin': {
    name: 'Atorvastatin',
    genericName: 'Atorvastatin calcium',
    salt: 'Atorvastatin calcium trihydrate',
    composition: ['Atorvastatin 10mg/20mg/40mg/80mg'],
    manufacturer: 'Various',
    strength: '10mg, 20mg, 40mg, 80mg',
    commonBrands: ['Lipitor', 'Sortis', 'Atorva', 'Atorlip'],
  },
  'omeprazole': {
    name: 'Omeprazole',
    genericName: 'Omeprazole',
    salt: 'Omeprazole delayed-release',
    composition: ['Omeprazole 20mg/40mg'],
    manufacturer: 'Various',
    strength: '20mg, 40mg',
    commonBrands: ['Prilosec', 'Omee', 'Ozole', 'Peptac'],
  },
  'clopidogrel': {
    name: 'Clopidogrel',
    genericName: 'Clopidogrel bisulfate',
    salt: 'Clopidogrel bisulfate',
    composition: ['Clopidogrel 75mg'],
    manufacturer: 'Various',
    strength: '75mg',
    commonBrands: ['Plavix', 'Cloplet', 'Deplatt', 'Clodrel'],
  },
  'ranitidine': {
    name: 'Ranitidine',
    genericName: 'Ranitidine',
    salt: 'Ranitidine HCl',
    composition: ['Ranitidine 150mg/300mg'],
    manufacturer: 'Various',
    strength: '150mg, 300mg',
    commonBrands: ['Zantac', 'Ranidine', 'Gastromet', 'Acidil'],
  },
  'amitriptyline': {
    name: 'Amitriptyline',
    genericName: 'Amitriptyline',
    salt: 'Amitriptyline HCl',
    composition: ['Amitriptyline 10mg/25mg/50mg'],
    manufacturer: 'Various',
    strength: '10mg, 25mg, 50mg',
    commonBrands: ['Elavil', 'Adepril', 'Triptyline', 'Amitrol'],
  },
  'loratadine': {
    name: 'Loratadine',
    genericName: 'Loratadine',
    salt: 'Loratadine',
    composition: ['Loratadine 10mg'],
    manufacturer: 'Various',
    strength: '10mg',
    commonBrands: ['Claritin', 'Loratadine Plus', 'Lorfast', 'Loraclear'],
  },
  'ciprofloxacin': {
    name: 'Ciprofloxacin',
    genericName: 'Ciprofloxacin',
    salt: 'Ciprofloxacin HCl',
    composition: ['Ciprofloxacin 250mg/500mg/750mg'],
    manufacturer: 'Various',
    strength: '250mg, 500mg, 750mg',
    commonBrands: ['Cipro', 'Ciprolet', 'Ciplox', 'Ciprodar'],
  },
  'doxycycline': {
    name: 'Doxycycline',
    genericName: 'Doxycycline',
    salt: 'Doxycycline hyclate',
    composition: ['Doxycycline 100mg'],
    manufacturer: 'Various',
    strength: '100mg',
    commonBrands: ['Vibramycin', 'Doxytet', 'Doxy', 'Doxit'],
  },
  'cetirizine': {
    name: 'Cetirizine',
    genericName: 'Cetirizine HCl',
    salt: 'Cetirizine hydrochloride',
    composition: ['Cetirizine 5mg/10mg'],
    manufacturer: 'Various',
    strength: '5mg, 10mg',
    commonBrands: ['Allertech', 'Cetidew', 'Histakind', 'Zimella'],
  },
};

export class MedicineDatabase {
  /**
   * Search for medicine information
   */
  static async searchMedicine(medicineName: string): Promise<MedicineInfo | null> {
    if (!medicineName) {
      return null;
    }

    const searchQuery = medicineName.toLowerCase().trim();

    try {
      // First check local database
      const localMatch = this.searchLocalDatabase(searchQuery);
      if (localMatch) {
        return localMatch;
      }

      // Try to fetch from OpenFDA API (free tier)
      return await this.searchOpenFDADatabase(searchQuery);
    } catch (error) {
      console.error('Error searching medicine database:', error);
      return null;
    }
  }

  /**
   * Search in local database
   */
  private static searchLocalDatabase(query: string): MedicineInfo | null {
    // Try exact match first
    if (INDIAN_MEDICINES_DB[query]) {
      return INDIAN_MEDICINES_DB[query];
    }

    // Try partial match
    for (const [key, medicine] of Object.entries(INDIAN_MEDICINES_DB)) {
      if (
        key.includes(query) ||
        medicine.name.toLowerCase().includes(query) ||
        medicine.commonBrands.some((brand) => brand.toLowerCase().includes(query))
      ) {
        return medicine;
      }
    }

    return null;
  }

  /**
   * Search OpenFDA database (free API)
   */
  private static async searchOpenFDADatabase(
    medicineName: string
  ): Promise<MedicineInfo | null> {
    try {
      // OpenFDA API endpoint - limited free access
      const response = await fetch(
        `https://api.fda.gov/drug/ndc.json?search=proprietary_name:"${medicineName}"&limit=1`,
        { signal: AbortSignal.timeout(5000) }
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        return null;
      }

      const drug = data.results[0];

      return {
        name: drug.proprietary_name?.[0] || medicineName,
        genericName: drug.generic_name?.[0] || 'Unknown',
        salt: drug.active_ingredients?.[0]?.name || 'Unknown',
        composition: drug.active_ingredients?.map((ing: any) => `${ing.name} ${ing.strength}`) || [],
        manufacturer: drug.labeler_name?.[0] || 'Unknown',
        strength: drug.active_ingredients?.[0]?.strength || 'Unknown',
        commonBrands: [drug.proprietary_name?.[0] || ''],
      };
    } catch (error) {
      console.warn('OpenFDA API search failed:', error);
      return null;
    }
  }

  /**
   * Get medicine composition details
   */
  static getMedicineComposition(medicineName: string): string {
    const medicine = this.searchLocalDatabase(medicineName.toLowerCase());

    if (!medicine) {
      return 'Not found in database';
    }

    return `
**${medicine.name}** (${medicine.genericName})
- Salt: ${medicine.salt}
- Strength: ${medicine.strength}
- Composition: ${medicine.composition.join(', ')}
- Common Brands: ${medicine.commonBrands.join(', ')}
- Manufacturer: ${medicine.manufacturer}
    `.trim();
  }

  /**
   * Extract medicines from prescription text and get their info
   */
  static async enrichMedicinesWithComposition(
    medicines: Array<{ name: string; [key: string]: any }>
  ): Promise<Array<{ name: string; info: MedicineInfo | null; [key: string]: any }>> {
    const enriched = await Promise.all(
      medicines.map(async (med) => ({
        ...med,
        info: await this.searchMedicine(med.name),
      }))
    );

    return enriched;
  }
}
