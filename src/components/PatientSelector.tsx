import { useState, useEffect } from 'react';
import { Search, UserPlus } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Patient } from '../types';
import { useMembers } from '../hooks/useApi';
import { MemberPicker } from './MemberPicker';
import { toast } from 'sonner@2.0.3';

interface PatientSelectorProps {
  onPatientSelect: (patient: Patient) => void;
  selectedPatient: Patient | null;
}

export function PatientSelector({ onPatientSelect, selectedPatient }: PatientSelectorProps) {
  const [isNewPatientOpen, setIsNewPatientOpen] = useState(false);
  const { createMember } = useMembers();

  // New patient form state
  const [newPatient, setNewPatient] = useState({
    name: '',
    age: '',
    sex: 'Male' as 'Male' | 'Female' | 'Other',
    mobile: '',
  });

  const handleCreatePatient = async () => {
    if (!newPatient.name || !newPatient.age || !newPatient.mobile) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      const patient = await createMember({
        name: newPatient.name,
        age: parseInt(newPatient.age),
        sex: newPatient.sex,
        mobile: newPatient.mobile,
      });

      onPatientSelect(patient);
      setIsNewPatientOpen(false);
      setNewPatient({ name: '', age: '', sex: 'Male', mobile: '' });
      toast.success('Patient created successfully');
    } catch (error: any) {
      console.error('Failed to create patient:', error);
      toast.error(error.message || 'Failed to create patient');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <MemberPicker
            onMemberSelect={onPatientSelect}
            selectedMember={selectedPatient}
            placeholder="Search or select patient by ID, name, or mobile..."
          />
        </div>

        <Dialog open={isNewPatientOpen} onOpenChange={setIsNewPatientOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="gap-2 border-gray-200">
              <UserPlus className="h-4 w-4" />
              New Patient
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Patient</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={newPatient.name}
                  onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })}
                  placeholder="Patient name"
                  className="bg-white border-gray-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    type="number"
                    value={newPatient.age}
                    onChange={(e) => setNewPatient({ ...newPatient, age: e.target.value })}
                    placeholder="Age"
                    className="bg-white border-gray-200"
                  />
                </div>
                <div>
                  <Label htmlFor="sex">Sex *</Label>
                  <Select
                    value={newPatient.sex}
                    onValueChange={(value: 'Male' | 'Female' | 'Other') => 
                      setNewPatient({ ...newPatient, sex: value })
                    }
                  >
                    <SelectTrigger id="sex" className="bg-white border-gray-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="mobile">Mobile *</Label>
                <Input
                  id="mobile"
                  value={newPatient.mobile}
                  onChange={(e) => setNewPatient({ ...newPatient, mobile: e.target.value })}
                  placeholder="Mobile number"
                  className="bg-white border-gray-200"
                />
              </div>
              <Button 
                onClick={handleCreatePatient}
                className="w-full bg-[#3e65f3] hover:bg-[#3e65f3]/90"
                disabled={!newPatient.name || !newPatient.age || !newPatient.mobile}
              >
                Create Patient
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {selectedPatient && (
        <div className="p-4 border border-gray-200 rounded-lg bg-gray-50">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="text-gray-500 text-xs mb-1">Patient ID</div>
              <div className="font-medium">{selectedPatient.member_id}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Name</div>
              <div className="font-medium">{selectedPatient.name}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Age</div>
              <div className="font-medium">{selectedPatient.age} Years</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Sex</div>
              <div className="font-medium">{selectedPatient.sex}</div>
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Mobile</div>
              <div className="font-medium">{selectedPatient.mobile}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}