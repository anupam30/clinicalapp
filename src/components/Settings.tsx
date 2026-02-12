import { useState, useEffect } from 'react';
import { Save, User, Building, Palette } from 'lucide-react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { useSettings } from '../hooks/useApi';
import { toast } from 'sonner@2.0.3';

export function Settings() {
  const { settings, fetchSettings, updateSettings, loading } = useSettings();
  
  const [formData, setFormData] = useState({
    doctor_name: '',
    specialization: '',
    registration_number: '',
    contact: '',
    clinic_name: '',
    clinic_address: '',
    theme_color: '#3e65f3',
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    if (settings) {
      setFormData({
        doctor_name: settings.doctor_name || '',
        specialization: settings.specialization || '',
        registration_number: settings.registration_number || '',
        contact: settings.contact || '',
        clinic_name: settings.clinic_name || '',
        clinic_address: settings.clinic_address || '',
        theme_color: settings.theme_color || '#3e65f3',
      });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings(formData);
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and clinic settings</p>
      </div>

      {/* Doctor Profile */}
      <Card className="p-6 bg-white border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-50 rounded-lg">
            <User className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Doctor Profile</h2>
            <p className="text-sm text-gray-500">Your professional information</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="doctor_name">Doctor Name *</Label>
            <Input
              id="doctor_name"
              value={formData.doctor_name}
              onChange={(e) => handleChange('doctor_name', e.target.value)}
              placeholder="Dr. John Doe"
              className="bg-white border-gray-200"
            />
          </div>

          <div>
            <Label htmlFor="specialization">Specialization</Label>
            <Input
              id="specialization"
              value={formData.specialization}
              onChange={(e) => handleChange('specialization', e.target.value)}
              placeholder="General Physician"
              className="bg-white border-gray-200"
            />
          </div>

          <div>
            <Label htmlFor="registration_number">Registration Number</Label>
            <Input
              id="registration_number"
              value={formData.registration_number}
              onChange={(e) => handleChange('registration_number', e.target.value)}
              placeholder="MCI-12345"
              className="bg-white border-gray-200"
            />
          </div>

          <div>
            <Label htmlFor="contact">Contact Number</Label>
            <Input
              id="contact"
              value={formData.contact}
              onChange={(e) => handleChange('contact', e.target.value)}
              placeholder="+91 98765 43210"
              className="bg-white border-gray-200"
            />
          </div>
        </div>
      </Card>

      {/* Clinic Details */}
      <Card className="p-6 bg-white border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-green-50 rounded-lg">
            <Building className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Clinic Details</h2>
            <p className="text-sm text-gray-500">Information about your practice</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="clinic_name">Clinic Name</Label>
            <Input
              id="clinic_name"
              value={formData.clinic_name}
              onChange={(e) => handleChange('clinic_name', e.target.value)}
              placeholder="City Health Clinic"
              className="bg-white border-gray-200"
            />
          </div>

          <div>
            <Label htmlFor="clinic_address">Clinic Address</Label>
            <Input
              id="clinic_address"
              value={formData.clinic_address}
              onChange={(e) => handleChange('clinic_address', e.target.value)}
              placeholder="123 Main Street, City, State - 400001"
              className="bg-white border-gray-200"
            />
          </div>
        </div>
      </Card>

      {/* Theme Settings */}
      <Card className="p-6 bg-white border-gray-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-purple-50 rounded-lg">
            <Palette className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Theme Settings</h2>
            <p className="text-sm text-gray-500">Customize the application appearance</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Label htmlFor="theme_color">Primary Theme Color</Label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              id="theme_color"
              value={formData.theme_color}
              onChange={(e) => handleChange('theme_color', e.target.value)}
              className="h-10 w-20 rounded border border-gray-200 cursor-pointer"
            />
            <span className="text-sm text-gray-600">{formData.theme_color}</span>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button 
          onClick={handleSave} 
          className="gap-2 bg-primary hover:bg-primary/90"
          disabled={loading}
        >
          <Save className="h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}
