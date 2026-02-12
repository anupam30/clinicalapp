import { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle, Clock, FileText, Activity } from 'lucide-react';
import { Card } from './ui/card';
import { MemberPicker } from './MemberPicker';
import { Patient } from '../types';
import { useConsultations } from '../hooks/useApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';

interface PatientLifecycleProps {
  onPatientSelect?: (patient: Patient) => void;
}

export function PatientLifecycle({ onPatientSelect }: PatientLifecycleProps) {
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedConsultation, setSelectedConsultation] = useState<any>(null);
  const { consultations, fetchConsultations } = useConsultations();

  useEffect(() => {
    if (selectedPatient) {
      fetchConsultations(selectedPatient.member_id);
      // Notify parent component about patient selection
      if (onPatientSelect) {
        onPatientSelect(selectedPatient);
      }
    }
  }, [selectedPatient]);

  const getStatusColor = (consultation: any) => {
    if (consultation.status === 'completed') {
      return 'bg-green-50 border-green-200 text-green-700';
    }
    return 'bg-orange-50 border-orange-200 text-orange-700';
  };

  const getStatusIcon = (consultation: any) => {
    if (consultation.status === 'completed') {
      return <CheckCircle className="h-5 w-5 text-green-600" />;
    }
    return <Clock className="h-5 w-5 text-orange-600" />;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Patient Lifecycle</h1>
        <p className="text-sm text-gray-500 mt-1">View complete medical history and treatment timeline</p>
      </div>

      {/* Patient Selector */}
      <Card className="p-6 bg-white border-gray-200">
        <Label className="text-sm font-medium text-gray-700 mb-2 block">Select Patient</Label>
        <MemberPicker
          onMemberSelect={setSelectedPatient}
          selectedMember={selectedPatient}
          placeholder="Search for a patient to view their lifecycle..."
        />
      </Card>

      {/* Patient Summary */}
      {selectedPatient && (
        <Card className="p-6 bg-gradient-to-br from-blue-50 to-white border-blue-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{selectedPatient.name}</h2>
              <div className="flex gap-4 mt-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <strong>ID:</strong> {selectedPatient.member_id}
                </span>
                <span className="flex items-center gap-1">
                  <strong>Age:</strong> {selectedPatient.age} Years
                </span>
                <span className="flex items-center gap-1">
                  <strong>Sex:</strong> {selectedPatient.sex}
                </span>
                <span className="flex items-center gap-1">
                  <strong>Mobile:</strong> {selectedPatient.mobile}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">{consultations.length}</div>
              <div className="text-xs text-gray-500">Total Visits</div>
            </div>
          </div>
        </Card>
      )}

      {/* Timeline */}
      {selectedPatient && consultations.length > 0 && (
        <Card className="p-6 bg-white border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Medical Timeline
          </h3>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

            {/* Timeline Items */}
            <div className="space-y-6">
              {consultations.map((consultation, index) => (
                <div key={consultation.consultation_id} className="relative pl-16">
                  {/* Timeline Dot */}
                  <div className={`absolute left-3 top-2 w-6 h-6 rounded-full border-4 border-white ${
                    consultation.status === 'completed' ? 'bg-green-500' : 'bg-orange-500'
                  }`}></div>

                  {/* Consultation Card */}
                  <div
                    className={`p-4 rounded-lg border-2 cursor-pointer hover:shadow-md transition-shadow ${getStatusColor(consultation)}`}
                    onClick={() => setSelectedConsultation(consultation)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusIcon(consultation)}
                          <span className="font-semibold">
                            {consultation.prescription?.diagnosis || 'Consultation Record'}
                          </span>
                        </div>
                        
                        <div className="text-sm space-y-1">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar className="h-3 w-3" />
                            <span>{formatDate(consultation.created_at)} at {formatTime(consultation.created_at)}</span>
                          </div>
                          
                          {consultation.prescription?.chiefComplaint && (
                            <div className="flex items-start gap-2 text-gray-700">
                              <AlertCircle className="h-3 w-3 mt-0.5" />
                              <span><strong>Chief Complaint:</strong> {consultation.prescription.chiefComplaint}</span>
                            </div>
                          )}

                          {consultation.prescription?.medications?.length > 0 && (
                            <div className="flex items-center gap-2 text-gray-600">
                              <FileText className="h-3 w-3" />
                              <span>{consultation.prescription.medications.length} medications prescribed</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-xs px-2 py-1 rounded bg-white/50">
                        {consultation.status === 'completed' ? 'Resolved' : 'Ongoing'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {selectedPatient && consultations.length === 0 && (
        <Card className="p-12 text-center bg-white border-gray-200">
          <Activity className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No Consultations Yet</h3>
          <p className="text-gray-500">
            This patient has no consultation history. Start a new consultation to begin tracking.
          </p>
        </Card>
      )}

      {!selectedPatient && (
        <Card className="p-12 text-center bg-white border-gray-200">
          <Activity className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Select a Patient</h3>
          <p className="text-gray-500">
            Choose a patient from the dropdown above to view their complete medical timeline
          </p>
        </Card>
      )}

      {/* Consultation Detail Dialog */}
      <Dialog open={!!selectedConsultation} onOpenChange={() => setSelectedConsultation(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Consultation Details</DialogTitle>
          </DialogHeader>
          {selectedConsultation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Date:</span>
                  <span className="ml-2 font-medium">{formatDate(selectedConsultation.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Time:</span>
                  <span className="ml-2 font-medium">{formatTime(selectedConsultation.created_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500">Status:</span>
                  <span className="ml-2 font-medium">{selectedConsultation.status}</span>
                </div>
                <div>
                  <span className="text-gray-500">Consultation ID:</span>
                  <span className="ml-2 font-medium">{selectedConsultation.consultation_id}</span>
                </div>
              </div>

              {selectedConsultation.prescription && (
                <div className="space-y-4 pt-4 border-t">
                  {selectedConsultation.prescription.chiefComplaint && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Chief Complaint</h4>
                      <p className="text-sm text-gray-700">{selectedConsultation.prescription.chiefComplaint}</p>
                    </div>
                  )}

                  {selectedConsultation.prescription.diagnosis && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Diagnosis</h4>
                      <p className="text-sm text-gray-700">{selectedConsultation.prescription.diagnosis}</p>
                    </div>
                  )}

                  {selectedConsultation.prescription.medications?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-2">Medications</h4>
                      <div className="space-y-2">
                        {selectedConsultation.prescription.medications.map((med: any, idx: number) => (
                          <div key={idx} className="p-3 bg-gray-50 rounded text-sm">
                            <div className="font-medium text-gray-900">{med.name}</div>
                            <div className="text-gray-600 mt-1">
                              {med.dosage} • {med.frequency} • {med.duration}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedConsultation.prescription.investigations?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Investigations</h4>
                      <p className="text-sm text-gray-700">
                        {selectedConsultation.prescription.investigations.join(', ')}
                      </p>
                    </div>
                  )}

                  {selectedConsultation.prescription.advice && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Advice</h4>
                      <p className="text-sm text-gray-700">{selectedConsultation.prescription.advice}</p>
                    </div>
                  )}

                  {selectedConsultation.prescription.followUp && (
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">Follow-up</h4>
                      <p className="text-sm text-gray-700">{selectedConsultation.prescription.followUp}</p>
                    </div>
                  )}
                </div>
              )}

              {selectedConsultation.transcript && (
                <div className="pt-4 border-t">
                  <h4 className="font-semibold text-gray-900 mb-2">Conversation Transcript</h4>
                  <div className="p-3 bg-gray-50 rounded text-sm text-gray-700 max-h-60 overflow-auto">
                    {selectedConsultation.transcript}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return <label className={className}>{children}</label>;
}