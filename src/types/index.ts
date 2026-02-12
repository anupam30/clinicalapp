export interface Patient {
  member_id: string;
  name: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  mobile: string;
  email?: string;
  address?: string;
  blood_group?: string;
  family_history?: any;
  allergies?: string[];
  created_at: string;
  updated_at: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

export interface Prescription {
  chiefComplaint: string;
  symptoms: string[];
  medicalHistory: string;
  previousMedication: string[];
  previousReports: string;
  diagnosis: string;
  medications: Medication[];
  investigations: string[];
  advice: string;
  followUp: string;
}

export interface Consultation {
  consultation_id: string;
  member_id: string;
  transcript: string;
  prescription: Prescription;
  status: 'ongoing' | 'completed';
  created_at: string;
  updated_at: string;
  // Legacy support
  id?: string;
  createdAt?: string;
}

export interface DoctorSettings {
  id: string;
  doctor_name?: string;
  specialization?: string;
  registration_number?: string;
  contact?: string;
  clinic_name?: string;
  clinic_address?: string;
  theme_color?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardKPIs {
  period: 'day' | 'week' | 'month';
  registered: number;
  visited: number;
  followUpPending: number;
  totalMembers: number;
}