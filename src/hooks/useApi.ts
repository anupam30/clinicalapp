import { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';
import { Patient, DashboardKPIs, DoctorSettings } from '../types';
import { getAuthProvider } from '../services/ServiceManager';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-ae2bff40`;

// Helper function to get auth token
async function getAuthToken(): Promise<string> {
  try {
    const authProvider = await getAuthProvider();
    const session = await authProvider.getSession();
    
    if (session?.accessToken) {
      return session.accessToken;
    }
    
    // Fallback to anon key if no session (shouldn't happen in protected routes)
    console.warn('No auth session found, using anon key');
    return publicAnonKey;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return publicAnonKey;
  }
}

export const useMembers = () => {
  const [members, setMembers] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchMembers = async (query: string) => {
    if (!query.trim()) {
      setMembers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/members/search?q=${encodeURIComponent(query)}`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to search members');
      }

      const data = await response.json();
      setMembers(data.members || []);
    } catch (err) {
      console.error('Error searching members:', err);
      setError(err instanceof Error ? err.message : 'Failed to search members');
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  const createMember = async (memberData: Omit<Patient, 'member_id' | 'created_at' | 'updated_at'>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(memberData),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create member');
      }

      return data.member;
    } catch (err) {
      console.error('Error creating member:', err);
      setError(err instanceof Error ? err.message : 'Failed to create member');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getMember = async (memberId: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/members/${memberId}`, {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch member');
      }

      const data = await response.json();
      return data.member;
    } catch (err) {
      console.error('Error fetching member:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch member');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getAllMembers = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/members`, {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch members');
      }

      const data = await response.json();
      setMembers(data.members || []);
      return data.members;
    } catch (err) {
      console.error('Error fetching members:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch members');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    members,
    loading,
    error,
    searchMembers,
    createMember,
    getMember,
    getAllMembers,
  };
};

export const useConsultations = (memberId?: string) => {
  const [consultations, setConsultations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (memberId) {
      fetchConsultations(memberId);
    }
  }, [memberId]);

  const fetchConsultations = async (id: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/members/${id}/consultations`, {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch consultations');
      }

      const data = await response.json();
      setConsultations(data.consultations || []);
    } catch (err) {
      console.error('Error fetching consultations:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch consultations');
    } finally {
      setLoading(false);
    }
  };

  const createConsultation = async (consultationData: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/consultations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(consultationData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create consultation');
      }

      const data = await response.json();
      return data.consultation;
    } catch (err) {
      console.error('Error creating consultation:', err);
      setError(err instanceof Error ? err.message : 'Failed to create consultation');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateConsultation = async (consultationId: string, updates: any) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/consultations/${consultationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update consultation');
      }

      const data = await response.json();
      return data.consultation;
    } catch (err) {
      console.error('Error updating consultation:', err);
      setError(err instanceof Error ? err.message : 'Failed to update consultation');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const generatePrescription = async (transcript: string) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/generate-prescription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate prescription');
      }

      const data = await response.json();
      return data.prescription;
    } catch (err) {
      console.error('Error generating prescription:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate prescription');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    consultations,
    loading,
    error,
    fetchConsultations,
    createConsultation,
    updateConsultation,
    generatePrescription,
  };
};

export const useDashboard = () => {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKPIs = async (period: 'day' | 'week' | 'month' = 'day') => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/dashboard/kpis?period=${period}`,
        {
          headers: {
            Authorization: `Bearer ${await getAuthToken()}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch KPIs');
      }

      const data = await response.json();
      setKpis(data);
      return data;
    } catch (err) {
      console.error('Error fetching KPIs:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch KPIs');
    } finally {
      setLoading(false);
    }
  };

  return {
    kpis,
    loading,
    error,
    fetchKPIs,
  };
};

export const useSettings = () => {
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/settings`, {
        headers: {
          Authorization: `Bearer ${await getAuthToken()}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      return data.settings;
    } catch (err) {
      console.error('Error fetching settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates: Partial<DoctorSettings>) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update settings');
      }

      const data = await response.json();
      setSettings(data.settings);
      return data.settings;
    } catch (err) {
      console.error('Error updating settings:', err);
      setError(err instanceof Error ? err.message : 'Failed to update settings');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateSettings,
  };
};