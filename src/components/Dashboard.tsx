import { useState, useEffect } from 'react';
import { Search, UserPlus, Users, Calendar, Clock, TrendingUp } from 'lucide-react';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useDashboard, useMembers } from '../hooks/useApi';
import { Patient } from '../types';
import { MemberPicker } from './MemberPicker';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

interface DashboardProps {
  onPatientSelect: (patient: Patient) => void;
  onNewConsultation: () => void;
}

export function Dashboard({ onPatientSelect, onNewConsultation }: DashboardProps) {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  const { kpis, fetchKPIs } = useDashboard();

  useEffect(() => {
    fetchKPIs(period);
  }, [period]);

  const handlePatientSelect = (patient: Patient) => {
    setSelectedPatient(patient);
    onPatientSelect(patient);
  };

  // Mock chart data
  const chartData = [
    { name: 'Mon', patients: 12, consultations: 10 },
    { name: 'Tue', patients: 19, consultations: 15 },
    { name: 'Wed', patients: 15, consultations: 12 },
    { name: 'Thu', patients: 25, consultations: 20 },
    { name: 'Fri', patients: 22, consultations: 18 },
    { name: 'Sat', patients: 30, consultations: 25 },
    { name: 'Sun', patients: 10, consultations: 8 },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Search */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of your practice</p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <div className="flex-1 md:w-80">
            <MemberPicker
              onMemberSelect={handlePatientSelect}
              selectedMember={selectedPatient}
              placeholder="Search patient by ID, name, or mobile..."
            />
          </div>

          <Button onClick={onNewConsultation} className="gap-2 bg-primary hover:bg-primary/90">
            <UserPlus className="h-4 w-4" />
            New Consultation
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">View:</span>
        <Select value={period} onValueChange={(value: any) => setPeriod(value)}>
          <SelectTrigger className="w-32 bg-white border-gray-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 bg-white border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Patients Registered</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{kpis?.registered || 0}</p>
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Patients Visited</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{kpis?.visited || 0}</p>
              <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" />
                {period === 'day' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Calendar className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Follow-up Pending</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{kpis?.followUpPending || 0}</p>
              <p className="text-xs text-orange-600 mt-2 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Ongoing treatments
              </p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </Card>

        <Card className="p-5 bg-white border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Total Patients</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{kpis?.totalMembers || 0}</p>
              <p className="text-xs text-gray-600 mt-2">
                All time
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 bg-white border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Patient Visits Trend</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="consultations" 
                stroke="#3e65f3" 
                strokeWidth={2}
                dot={{ fill: '#3e65f3', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 bg-white border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Registration vs Consultations</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={12} />
              <YAxis stroke="#6b7280" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#fff', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}
              />
              <Bar dataKey="patients" fill="#3e65f3" radius={[4, 4, 0, 0]} />
              <Bar dataKey="consultations" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}