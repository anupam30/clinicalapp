import { Calendar, FileText, Stethoscope, Clock } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Consultation } from '../types';
import { useState } from 'react';

interface VisitHistoryProps {
  consultations: Consultation[];
  patientName: string;
}

export function VisitHistory({ consultations, patientName }: VisitHistoryProps) {
  const [selectedConsultation, setSelectedConsultation] = useState<Consultation | null>(null);

  return (
    <>
      <div className="mt-8">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Visit History</h3>
        
        {consultations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-30" />
            <p>No previous visits found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {consultations.map((consultation) => (
              <div
                key={consultation.consultation_id || consultation.id}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-white"
                onClick={() => setSelectedConsultation(consultation)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4" />
                    {consultation.created_at ? new Date(consultation.created_at).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    }) : 'Date not available'}
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="h-3 w-3" />
                    {consultation.created_at ? new Date(consultation.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }) : ''}
                  </div>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Patient</p>
                    <p className="text-sm font-medium text-gray-900">{patientName}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase">Chief Complaint</p>
                    <p className="text-sm text-gray-800 line-clamp-2">
                      {consultation.prescription?.chiefComplaint || 'N/A'}
                    </p>
                  </div>

                  {consultation.prescription?.investigations && 
                   consultation.prescription.investigations.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase">Investigations</p>
                      <p className="text-sm text-gray-800 line-clamp-1">
                        {consultation.prescription.investigations.join(', ')}
                      </p>
                    </div>
                  )}

                  {consultation.prescription?.advice && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase">Advice</p>
                      <p className="text-sm text-gray-800 line-clamp-2">
                        {consultation.prescription.advice}
                      </p>
                    </div>
                  )}

                  {consultation.prescription?.followUp && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t">
                      <Stethoscope className="h-3 w-3 text-blue-600" />
                      <p className="text-xs text-blue-600 font-medium">
                        Follow-up: {consultation.prescription.followUp}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Detail View Dialog */}
      <Dialog open={!!selectedConsultation} onOpenChange={() => setSelectedConsultation(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Consultation Details</DialogTitle>
          </DialogHeader>

          {selectedConsultation && (
            <div className="space-y-6 mt-4">
              {/* Header */}
              <div className="border-b pb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold">{patientName}</h3>
                  <div className="text-sm text-gray-600">
                    {selectedConsultation.created_at ? new Date(selectedConsultation.created_at).toLocaleString('en-IN') : 'Date not available'}
                  </div>
                </div>
              </div>

              {/* Conversation Summary */}
              {selectedConsultation.transcript && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 uppercase mb-2">
                    Conversation Summary
                  </h4>
                  <div className="bg-gray-50 border rounded-lg p-4 max-h-60 overflow-auto">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">
                      {selectedConsultation.transcript}
                    </p>
                  </div>
                </div>
              )}

              {/* Prescription Details */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 uppercase mb-3">
                  Prescription Details
                </h4>
                
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-4">
                    {selectedConsultation.prescription?.symptoms && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Symptoms</p>
                        <p className="text-sm text-gray-800">
                          {selectedConsultation.prescription.symptoms.join(', ')}
                        </p>
                      </div>
                    )}

                    {selectedConsultation.prescription?.medicalHistory && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Medical History</p>
                        <p className="text-sm text-gray-800">
                          {selectedConsultation.prescription.medicalHistory}
                        </p>
                      </div>
                    )}

                    {selectedConsultation.prescription?.previousMedication && 
                     selectedConsultation.prescription.previousMedication.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
                          Previous Medication
                        </p>
                        <p className="text-sm text-gray-800">
                          {selectedConsultation.prescription.previousMedication.join(', ')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Right Column */}
                  <div className="space-y-4">
                    {selectedConsultation.prescription?.chiefComplaint && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
                          Chief Complaint
                        </p>
                        <p className="text-sm text-gray-800">
                          {selectedConsultation.prescription.chiefComplaint}
                        </p>
                      </div>
                    )}

                    {selectedConsultation.prescription?.diagnosis && (
                      <div>
                        <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Diagnosis</p>
                        <p className="text-sm text-gray-800">
                          {selectedConsultation.prescription.diagnosis}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Medications */}
                {selectedConsultation.prescription?.medications && 
                 selectedConsultation.prescription.medications.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Medications</p>
                    <div className="space-y-2">
                      {selectedConsultation.prescription.medications.map((med, index) => (
                        <div key={`med-${selectedConsultation.consultation_id}-${index}-${med.name}`} className="bg-gray-50 border rounded p-3">
                          <p className="font-medium text-sm">{index + 1}. {med.name}</p>
                          <p className="text-xs text-gray-600 mt-1">
                            {med.dosage} | {med.frequency} | {med.duration}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Investigations */}
                {selectedConsultation.prescription?.investigations && 
                 selectedConsultation.prescription.investigations.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-1">
                      Investigations Recommended
                    </p>
                    <p className="text-sm text-gray-800">
                      {selectedConsultation.prescription.investigations.join(', ')}
                    </p>
                  </div>
                )}

                {/* Advice */}
                {selectedConsultation.prescription?.advice && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Advice</p>
                    <p className="text-sm text-gray-800">
                      {selectedConsultation.prescription.advice}
                    </p>
                  </div>
                )}

                {/* Follow-up */}
                {selectedConsultation.prescription?.followUp && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Follow-up</p>
                    <p className="text-sm text-gray-800">
                      {selectedConsultation.prescription.followUp}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}