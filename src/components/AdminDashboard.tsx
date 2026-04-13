import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { motion } from 'motion/react';
import { Users, BookOpen, Settings, ShieldCheck, Trash2, Edit, Plus, Search } from 'lucide-react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'classes' | 'questions'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'users') {
        const { data, error } = await supabase.from('profiles').select('*');
        if (error) throw error;
        setUsers(data || []);
      }
      // Add logic for classes and questions as needed
    } catch (err) {
      console.error('Error fetching admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);
      if (error) throw error;
      fetchData();
    } catch (err) {
      alert('Lỗi cập nhật quyền hạn');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-64 bg-indigo-900 text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10">
          <ShieldCheck className="text-yellow-400 w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight">Admin Panel</h1>
        </div>

        <nav className="space-y-2 flex-1">
          <button
            onClick={() => setActiveTab('users')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <Users className="w-5 h-5" /> Quản lý người dùng
          </button>
          <button
            onClick={() => setActiveTab('classes')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'classes' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <BookOpen className="w-5 h-5" /> Quản lý lớp học
          </button>
          <button
            onClick={() => setActiveTab('questions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'questions' ? 'bg-indigo-700 text-white shadow-lg' : 'text-indigo-300 hover:bg-indigo-800'}`}
          >
            <Settings className="w-5 h-5" /> Ngân hàng câu hỏi
          </button>
        </nav>

        <div className="pt-6 border-t border-indigo-800">
          <p className="text-xs text-indigo-400 uppercase font-bold tracking-widest mb-4">Hệ thống</p>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-indigo-300 hover:bg-indigo-800 transition-all">
            <Settings className="w-5 h-5" /> Cài đặt chung
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-gray-900">
              {activeTab === 'users' && 'Quản lý người dùng'}
              {activeTab === 'classes' && 'Quản lý lớp học'}
              {activeTab === 'questions' && 'Quản lý câu hỏi'}
            </h2>
            <p className="text-gray-500 mt-1">Xem và quản lý dữ liệu hệ thống Olympia Game</p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                placeholder="Tìm kiếm..." 
                className="pl-10 pr-4 py-2 rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-indigo-700 transition shadow-md">
              <Plus className="w-4 h-4" /> Thêm mới
            </button>
          </div>
        </header>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          </div>
        ) : activeTab === 'users' ? (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Vai trò</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Ngày tạo</th>
                  <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono">{user.id.substring(0, 8)}...</td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${user.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.updated_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      <button 
                        onClick={() => updateUserRole(user.id, user.role === 'admin' ? 'user' : 'admin')}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                        title="Đổi vai trò"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-20 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-50 rounded-full mb-6">
              <Settings className="w-10 h-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">Tính năng đang phát triển</h3>
            <p className="text-gray-500">Chức năng quản lý {activeTab === 'classes' ? 'lớp học' : 'câu hỏi'} chuyên sâu sẽ sớm được cập nhật.</p>
          </div>
        )}
      </div>
    </div>
  );
}
