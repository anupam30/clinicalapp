import { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { Input } from './ui/input';
import { Patient } from '../types';
import { useMembers } from '../hooks/useApi';

interface MemberPickerProps {
  onMemberSelect: (member: Patient) => void;
  selectedMember: Patient | null;
  placeholder?: string;
}

export function MemberPicker({ onMemberSelect, selectedMember, placeholder }: MemberPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredMembers, setFilteredMembers] = useState<Patient[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const { members, getAllMembers, searchMembers } = useMembers();

  // Load all members on mount
  useEffect(() => {
    getAllMembers();
  }, []);

  // Filter members based on search
  useEffect(() => {
    if (searchQuery.trim()) {
      searchMembers(searchQuery);
    } else {
      setFilteredMembers(members);
    }
  }, [searchQuery, members]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputFocus = () => {
    if (!searchQuery.trim()) {
      setFilteredMembers(members);
    }
    setShowDropdown(true);
  };

  const handleSelectMember = (member: Patient) => {
    onMemberSelect(member);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const displayValue = selectedMember 
    ? `${selectedMember.member_id} | ${selectedMember.name} | ${selectedMember.age}Y | ${selectedMember.sex}`
    : '';

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder={placeholder || "Search or select patient..."}
          value={showDropdown ? searchQuery : displayValue}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleInputFocus}
          className="pl-10 pr-10 bg-white border-gray-200"
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
      </div>
      
      {showDropdown && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-80 overflow-auto z-50">
          {filteredMembers.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              {searchQuery ? 'No patients found' : 'No registered patients'}
            </div>
          ) : (
            filteredMembers.map((member) => (
              <div
                key={member.member_id}
                className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent input blur
                  handleSelectMember(member);
                }}
              >
                <div className="font-medium text-sm text-gray-900">
                  {member.member_id} | {member.name} | {member.age}Y | {member.sex}
                </div>
                <div className="text-xs text-gray-500 mt-1">{member.mobile}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}