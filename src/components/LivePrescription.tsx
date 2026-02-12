import { useState, useEffect, type ReactNode } from 'react';
import { Edit2, Save, Share2, CheckCircle2, AlertCircle, Pill, Clock, Droplet, Calendar } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Prescription } from '../types';
import { type LLMProvider } from '@/services/llm/LLMManager';

interface LivePrescriptionProps {
  prescription: Prescription;
  onPrescriptionUpdate: (prescription: Prescription) => void;
  patientName: string;
  memberId: string;
  patientAge: number;
  patientSex: string;
  patientMobile: string;
  isEditable?: boolean;
  isLiveUpdating?: boolean;
  providerSelector?: ReactNode;
  modelSelector?: ReactNode;
  providerStatus?: Record<LLMProvider, { valid: boolean; tested: boolean; error?: string }>;
  activeProvider?: LLMProvider;
}

export function LivePrescription({
  prescription,
  onPrescriptionUpdate,
  patientName,
  memberId,
  patientAge,
  patientSex,
  patientMobile,
  isEditable = true,
  isLiveUpdating = false,
  providerSelector,
  modelSelector,
  providerStatus,
  activeProvider,
}: LivePrescriptionProps) {
  const [localPrescription, setLocalPrescription] = useState(prescription);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setLocalPrescription(prescription);
  }, [prescription]);

  const getProviderStatusIcon = () => {
    if (!activeProvider || !providerStatus) return null;
    
    const status = providerStatus[activeProvider];
    if (!status) return null;
    
    if (status.valid) {
      return (
        <div className="flex items-center gap-2 text-xs">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-green-700 font-medium">Ready</span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 text-xs">
        <AlertCircle className="h-4 w-4 text-gray-400" />
        <span className="text-gray-500">Unavailable</span>
      </div>
    );
  };

  const handleSave = () => {
    onPrescriptionUpdate(localPrescription);
    setIsEditing(false);
  };

  const handleMedicationChange = (index: number, field: string, value: string) => {
    const updatedMedications = [...localPrescription.medications];
    updatedMedications[index] = { ...updatedMedications[index], [field]: value };
    setLocalPrescription({ ...localPrescription, medications: updatedMedications });
  };

  const addMedication = () => {
    setLocalPrescription({
      ...localPrescription,
      medications: [...localPrescription.medications, { name: '', dosage: '', frequency: '', duration: '' }],
    });
  };

  const handleShare = () => {
    const prescriptionText = generatePrescriptionText();
    const whatsappUrl = `https://wa.me/${patientMobile}?text=${encodeURIComponent(prescriptionText)}`;
    window.open(whatsappUrl, '_blank');
  };

  const generatePrescriptionText = () => {
    return `
*Medical Prescription*

*Patient Details:*
ID: ${memberId}
Name: ${patientName}
Age: ${patientAge} Years
Sex: ${patientSex}

*Chief Complaint:*
${localPrescription.chiefComplaint}

*Diagnosis:*
${localPrescription.diagnosis}

*Medications:*
${localPrescription.medications.map((med, i) => 
  `${i + 1}. ${med.name} - ${med.dosage} - ${med.frequency} - ${med.duration}`
).join('\n')}

*Investigations:*
${localPrescription.investigations.join(', ')}

*Advice:*
${localPrescription.advice}

*Follow-up:*
${localPrescription.followUp}
    `.trim();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Live Prescription</h3>
        <div className="flex items-center justify-between gap-4">
          {/* LLM Provider & Model Selectors - Horizontal Compact */}
          {(providerSelector || modelSelector) && (
            <div className="flex items-center gap-3">
              {providerSelector && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 font-medium">Provider:</label>
                  {providerSelector}
                </div>
              )}
              
              {modelSelector && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600 font-medium">Model:</label>
                  {modelSelector}
                </div>
              )}
              
              {/* Selected Provider Status Indicator - Shows only for active provider */}
              {getProviderStatusIcon()}
            </div>
          )}
          {/* Edit and Share Buttons */}
          <div className="flex justify-end gap-2 ml-auto">
            {isEditable && (
              <>
                {isEditing ? (
                  <Button onClick={handleSave} size="sm" className="gap-2">
                    <Save className="h-4 w-4" />
                    Save
                  </Button>
                ) : (
                  <Button onClick={() => setIsEditing(true)} variant="outline" size="sm" className="gap-2">
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </Button>
                )}
              </>
            )}
            <Button onClick={handleShare} variant="outline" size="sm" className="gap-2">
              <Share2 className="h-4 w-4" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white border rounded-lg p-6 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Header */}
          <div className="border-b pb-4">
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold text-gray-900">Medical Prescription</h1>
              <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleDateString()}</p>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div className="flex">
                <span className="text-gray-500 w-24">Patient ID:</span>
                <span className="font-medium">{memberId}</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-24">Mobile:</span>
                <span className="font-medium">{patientMobile}</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-24">Name:</span>
                <span className="font-medium">{patientName}</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-24">Age/Sex:</span>
                <span className="font-medium">{patientAge}Y / {patientSex}</span>
              </div>
            </div>
          </div>

          {/* Two Column Layout - Only show sections with content */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Chief Complaint & Cause */}
              {isEditing || localPrescription.chiefComplaint && (
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase">Chief Complaint & Cause</Label>
                  {isEditing ? (
                    <Textarea
                      value={localPrescription.chiefComplaint || ''}
                      onChange={(e) => setLocalPrescription({
                        ...localPrescription,
                        chiefComplaint: e.target.value,
                      })}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-gray-800 mt-1">
                      {localPrescription.chiefComplaint || 'N/A'}
                    </p>
                  )}
                </div>
              )}

              {/* Symptoms */}
              {isEditing || (localPrescription.symptoms && localPrescription.symptoms.length > 0) && (
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase">Symptoms</Label>
                  {isEditing ? (
                    <Textarea
                      value={localPrescription.symptoms?.join(', ') || ''}
                      onChange={(e) => setLocalPrescription({
                        ...localPrescription,
                        symptoms: e.target.value.split(',').map(s => s.trim()).filter(s => s),
                      })}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  ) : (
                    <ul className="text-sm text-gray-800 mt-1 space-y-1">
                      {localPrescription.symptoms?.map((symptom, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-blue-600 mr-2">•</span>
                          <span>{symptom}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Medical History */}
              {isEditing || localPrescription.medicalHistory && (
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase">Medical History</Label>
                  {isEditing ? (
                    <Textarea
                      value={localPrescription.medicalHistory || ''}
                      onChange={(e) => setLocalPrescription({
                        ...localPrescription,
                        medicalHistory: e.target.value,
                      })}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-gray-800 mt-1">
                      {localPrescription.medicalHistory || 'N/A'}
                    </p>
                  )}
                </div>
              )}

              {/* Previous Medication */}
              {isEditing || (localPrescription.previousMedication && localPrescription.previousMedication.length > 0) && (
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase">Previous Medication</Label>
                  {isEditing ? (
                    <Textarea
                      value={localPrescription.previousMedication?.join(', ') || ''}
                      onChange={(e) => setLocalPrescription({
                        ...localPrescription,
                        previousMedication: e.target.value.split(',').map(s => s.trim()).filter(s => s),
                      })}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  ) : (
                    <ul className="text-sm text-gray-800 mt-1 space-y-1">
                      {localPrescription.previousMedication?.map((med, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-blue-600 mr-2">•</span>
                          <span>{med}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Diagnosis */}
              {isEditing || localPrescription.diagnosis && (
                <div>
                  <Label className="text-xs font-semibold text-gray-700 uppercase">Diagnosis</Label>
                  {isEditing ? (
                    <Textarea
                      value={localPrescription.diagnosis || ''}
                      onChange={(e) => setLocalPrescription({
                        ...localPrescription,
                        diagnosis: e.target.value,
                      })}
                      className="mt-1 text-sm"
                      rows={2}
                    />
                  ) : (
                    <p className="text-sm text-gray-800 mt-1 bg-yellow-50 p-3 rounded border-l-4 border-yellow-500">
                      {localPrescription.diagnosis || 'N/A'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Medications - Only show if present or editing */}
          {isEditing || (localPrescription.medications && localPrescription.medications.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <Label className="text-sm font-bold text-gray-900 uppercase tracking-wide">💊 Medications</Label>
                {isEditing && (
                  <Button onClick={addMedication} size="sm" variant="outline" className="text-xs">
                    + Add Medicine
                  </Button>
                )}
              </div>
              
              {/* Modern Card Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localPrescription.medications?.map((med, index) => (
                  <div 
                    key={index} 
                    className={`relative rounded-lg border-2 p-4 transition-all ${
                      isEditing 
                        ? 'bg-white border-blue-200 hover:border-blue-400' 
                        : 'bg-gradient-to-br from-green-50 to-emerald-50 border-green-300 hover:shadow-md'
                    }`}
                  >
                    {/* Rx Badge */}
                    <div className="absolute top-3 right-3 bg-red-500 text-white px-2.5 py-1 rounded-full text-xs font-bold">
                      Rx
                    </div>

                    {isEditing ? (
                      <div className="space-y-3">
                        <Input
                          placeholder="Medicine name"
                          value={med.name}
                          onChange={(e) => handleMedicationChange(index, 'name', e.target.value)}
                          className="text-sm font-semibold"
                        />
                        <Input
                          placeholder="Dosage (e.g., 500mg)"
                          value={med.dosage}
                          onChange={(e) => handleMedicationChange(index, 'dosage', e.target.value)}
                          className="text-sm"
                        />
                        <Input
                          placeholder="Frequency (e.g., twice daily)"
                          value={med.frequency}
                          onChange={(e) => handleMedicationChange(index, 'frequency', e.target.value)}
                          className="text-sm"
                        />
                        <Input
                          placeholder="Duration (e.g., 5 days)"
                          value={med.duration}
                          onChange={(e) => handleMedicationChange(index, 'duration', e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {/* Medicine Name */}
                        <div>
                          <h4 className="text-sm text-gray-600 font-medium uppercase tracking-wide">Medicine</h4>
                          <p className="text-lg font-bold text-gray-900 mt-1 flex items-center gap-2">
                            <Pill className="h-5 w-5 text-green-600" />
                            {med.name}
                          </p>
                        </div>

                        {/* Dosage */}
                        {med.dosage && (
                          <div className="flex items-center gap-3 bg-white bg-opacity-60 px-3 py-2 rounded-lg">
                            <Droplet className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-600 font-medium">Dosage</p>
                              <p className="text-sm font-semibold text-gray-900">{med.dosage}</p>
                            </div>
                          </div>
                        )}

                        {/* Frequency */}
                        {med.frequency && (
                          <div className="flex items-center gap-3 bg-white bg-opacity-60 px-3 py-2 rounded-lg">
                            <Clock className="h-4 w-4 text-orange-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-600 font-medium">Frequency</p>
                              <p className="text-sm font-semibold text-gray-900">{med.frequency}</p>
                            </div>
                          </div>
                        )}

                        {/* Duration */}
                        {med.duration && (
                          <div className="flex items-center gap-3 bg-white bg-opacity-60 px-3 py-2 rounded-lg">
                            <Calendar className="h-4 w-4 text-purple-600 flex-shrink-0" />
                            <div>
                              <p className="text-xs text-gray-600 font-medium">Duration</p>
                              <p className="text-sm font-semibold text-gray-900">{med.duration}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {(!localPrescription.medications || localPrescription.medications.length === 0) && !isEditing && (
                <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
                  <Pill className="h-12 w-12 mx-auto text-gray-300 mb-2" />
                  <p className="text-sm text-gray-500 italic">No medications prescribed yet</p>
                </div>
              )}
            </div>
          )}

          {/* Investigations - Only show if present or editing */}
          {isEditing || (localPrescription.investigations && localPrescription.investigations.length > 0) && (
            <div>
              <Label className="text-xs font-semibold text-gray-700 uppercase">Laboratory Investigations</Label>
              {isEditing ? (
                <Textarea
                  value={localPrescription.investigations?.join(', ') || ''}
                  onChange={(e) => setLocalPrescription({
                    ...localPrescription,
                    investigations: e.target.value.split(',').map(s => s.trim()).filter(s => s),
                  })}
                  className="mt-1 text-sm"
                  rows={2}
                />
              ) : (
                <ul className="text-sm text-gray-800 mt-1 space-y-1">
                  {localPrescription.investigations?.map((inv, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-green-600 mr-2">✓</span>
                      <span>{inv}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Advice - Only show if present or editing */}
          {isEditing || localPrescription.advice && (
            <div className={isEditing || localPrescription.advice ? 'bg-blue-50 border-l-4 border-blue-500 p-3 rounded-r' : ''}>
              <Label className="text-xs font-semibold text-gray-700 uppercase">Patient Instructions</Label>
              {isEditing ? (
                <Textarea
                  value={localPrescription.advice || ''}
                  onChange={(e) => setLocalPrescription({
                    ...localPrescription,
                    advice: e.target.value,
                  })}
                  className="mt-1 text-sm"
                  rows={2}
                />
              ) : (
                <ul className="text-sm text-gray-800 mt-1 space-y-1.5">
                  {localPrescription.advice?.split('\n').filter(line => line.trim()).map((instruction, idx) => (
                    <li key={idx} className="flex items-start">
                      <span className="text-blue-600 mr-2">→</span>
                      <span>{instruction}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Follow-up - Only show if present or editing */}
          {isEditing || localPrescription.followUp && (
            <div>
              <Label className="text-xs font-semibold text-gray-700 uppercase">Follow-up</Label>
              {isEditing ? (
                <Input
                  value={localPrescription.followUp || ''}
                  onChange={(e) => setLocalPrescription({
                    ...localPrescription,
                    followUp: e.target.value,
                  })}
                  className="mt-1 text-sm"
                />
              ) : (
                <p className="text-sm text-gray-800 mt-1">
                  {localPrescription.followUp || 'N/A'}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
