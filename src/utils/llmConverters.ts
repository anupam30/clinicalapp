/**
 * Convert LLM MedicalAnalysis to Prescription format
 */

import { MedicalAnalysis } from '@/services/llm/LLMManager';
import { Prescription } from '@/types';

export function medicalAnalysisToPrescription(
  analysis: MedicalAnalysis
): Prescription {
  return {
    chiefComplaint: analysis.chiefComplaint || '',
    symptoms: analysis.symptoms || [],
    medicalHistory: analysis.medicalHistory || '',
    previousMedication: analysis.medications?.map((med) => `${med.name} ${med.dosage}`.trim()) || [],
    previousReports: '',
    diagnosis: analysis.diagnosis || '',
    medications: analysis.medications?.map((med) => ({
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      duration: med.duration
    })) || [],
    investigations: analysis.investigationsSuggested || [],
    advice: analysis.instructions?.join('\n') || '',
    followUp: analysis.followUp || ''
  };
}

export function prescriptionToMedicalAnalysis(
  prescription: Prescription
): Partial<MedicalAnalysis> {
  return {
    chiefComplaint: prescription.chiefComplaint,
    symptoms: prescription.symptoms || [],
    medicalHistory: prescription.medicalHistory,
    diagnosis: prescription.diagnosis,
    medications: prescription.medications?.map((med) => ({
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency || '',
      duration: med.duration || ''
    })) || [],
    instructions: prescription.advice?.split('\n').filter(Boolean) || [],
    investigationsSuggested: prescription.investigations || [],
    followUp: prescription.followUp
  };
}
