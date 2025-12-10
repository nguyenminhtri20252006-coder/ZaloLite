"use client";

import { useState, useEffect } from "react";
import {
  getAllStaffAction,
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  changeStaffPasswordAction,
} from "@/lib/actions/staff.actions";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconUserPlus,
  IconRefresh,
  IconCog,
  IconClose,
  IconCheck,
} from "@/app/components/ui/Icons";

export function StaffManagerPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [staffList, setStaffList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"CREATE" | "EDIT" | "PASSWORD">(
    "CREATE",
  );

  // Form State
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "staff",
    phone: "",
  });

  const fetchStaff = async () => {
    setIsLoading(true);
    try {
      const data = await getAllStaffAction();
      setStaffList(data || []);
    } catch (e) {
      alert("Lỗi tải danh sách: " + e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  const resetForm = () => {
    setFormData({
      username: "",
      password: "",
      full_name: "",
      role: "staff",
      phone: "",
    });
    setSelectedStaff(null);
  };

  const handleOpenCreate = () => {
    resetForm();
    setModalMode("CREATE");
    setIsModalOpen(true);
  };

  const handleOpenEdit = (staff: any) => {
    setSelectedStaff(staff);
    setFormData({
      username: staff.username,
      password: "",
      full_name: staff.full_name,
      role: staff.role,
      phone: staff.phone || "",
    });
    setModalMode("EDIT");
    setIsModalOpen(true);
  };

  const handleOpenPassword = (staff: any) => {
    setSelectedStaff(staff);
    setFormData({ ...formData, password: "" });
    setModalMode("PASSWORD");
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    let res;
    if (modalMode === "CREATE") {
      if (!formData.username || !formData.password || !formData.full_name) {
        return alert("Vui lòng điền đủ thông tin");
      }
      res = await createStaffAction({
        username: formData.username,
        password: formData.password,
        full_name: formData.full_name,
        role: formData.role as "admin" | "staff",
        phone: formData.phone,
      });
    } else if (modalMode === "EDIT") {
      res = await updateStaffAction(selectedStaff.id, {
        full_name: formData.full_name,
        role: formData.role as "admin" | "staff",
        phone: formData.phone,
      });
    } else if (modalMode === "PASSWORD") {
      if (!formData.password) return alert("Nhập mật khẩu mới");
      res = await changeStaffPasswordAction(
        selectedStaff.id,
        formData.password,
      );
    }

    if (res?.success) {
      alert("Thành công!");
      setIsModalOpen(false);
      fetchStaff();
    } else {
      alert("Lỗi: " + res?.error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Chắc chắn xóa nhân viên này?")) return;
    const res = await deleteStaffAction(id);
    if (res.success) fetchStaff();
    else alert(res.error);
  };

  const handleToggleActive = async (staff: any) => {
    const newState = !staff.is_active;
    await updateStaffAction(staff.id, { is_active: newState });
    fetchStaff(); // Reload để cập nhật UI
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100 p-6">
      <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-bold text-white">Quản lý Nhân viên</h1>
          <p className="text-sm text-gray-400 mt-1">
            Danh sách tài khoản truy cập hệ thống
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchStaff}
            className="p-2 bg-gray-800 rounded hover:bg-gray-700"
          >
            <IconRefresh
              className={`w-5 h-5 ${isLoading ? "animate-spin" : ""}`}
            />
          </button>
          <button
            onClick={handleOpenCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium shadow-lg"
          >
            <IconUserPlus className="w-5 h-5" /> Thêm Nhân viên
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-700 text-gray-400 text-sm uppercase">
              <th className="p-3">Nhân viên</th>
              <th className="p-3">Vai trò</th>
              <th className="p-3">SĐT</th>
              <th className="p-3">Trạng thái</th>
              <th className="p-3 text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {staffList.map((staff) => (
              <tr
                key={staff.id}
                className="hover:bg-gray-800/50 transition-colors group"
              >
                <td className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar src={staff.avatar || ""} alt={staff.full_name} />
                    <div>
                      <div className="font-bold text-white">
                        {staff.full_name}
                      </div>
                      <div className="text-xs text-gray-500 font-mono">
                        @{staff.username}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold uppercase ${
                      staff.role === "admin"
                        ? "bg-purple-900 text-purple-300"
                        : "bg-blue-900 text-blue-300"
                    }`}
                  >
                    {staff.role}
                  </span>
                </td>
                <td className="p-3 text-sm text-gray-400">
                  {staff.phone || "---"}
                </td>
                <td className="p-3">
                  <button
                    onClick={() => handleToggleActive(staff)}
                    className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-medium border ${
                      staff.is_active
                        ? "border-green-800 text-green-400 bg-green-900/20"
                        : "border-red-800 text-red-400 bg-red-900/20"
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        staff.is_active ? "bg-green-500" : "bg-red-500"
                      }`}
                    />
                    {staff.is_active ? "Hoạt động" : "Đã khóa"}
                  </button>
                </td>
                <td className="p-3 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleOpenPassword(staff)}
                      className="p-2 hover:bg-gray-700 rounded text-yellow-500"
                      title="Đổi mật khẩu"
                    >
                      🔑
                    </button>
                    <button
                      onClick={() => handleOpenEdit(staff)}
                      className="p-2 hover:bg-gray-700 rounded text-blue-400"
                      title="Sửa"
                    >
                      <IconCog className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(staff.id)}
                      className="p-2 hover:bg-gray-700 rounded text-red-400"
                      title="Xóa"
                    >
                      <IconClose className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-gray-800 w-full max-w-md rounded-xl border border-gray-700 shadow-2xl overflow-hidden animate-scale-up">
            <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-lg">
                {modalMode === "CREATE"
                  ? "Thêm Nhân viên"
                  : modalMode === "EDIT"
                  ? "Sửa thông tin"
                  : "Đổi mật khẩu"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {modalMode !== "PASSWORD" && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">
                      Tên đăng nhập
                    </label>
                    <input
                      disabled={modalMode === "EDIT"}
                      className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white disabled:opacity-50"
                      value={formData.username}
                      onChange={(e) =>
                        setFormData({ ...formData, username: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">
                      Họ và tên
                    </label>
                    <input
                      className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                      value={formData.full_name}
                      onChange={(e) =>
                        setFormData({ ...formData, full_name: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">
                      Số điện thoại
                    </label>
                    <input
                      className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1">
                      Vai trò
                    </label>
                    <select
                      className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                      value={formData.role}
                      onChange={(e) =>
                        setFormData({ ...formData, role: e.target.value })
                      }
                    >
                      <option value="staff">Nhân viên (Staff)</option>
                      <option value="admin">Quản trị viên (Admin)</option>
                    </select>
                  </div>
                </>
              )}

              {(modalMode === "CREATE" || modalMode === "PASSWORD") && (
                <div>
                  <label className="block text-xs font-bold text-gray-400 mb-1">
                    {modalMode === "PASSWORD" ? "Mật khẩu mới" : "Mật khẩu"}
                  </label>
                  <input
                    type="password"
                    className="w-full bg-gray-900 border border-gray-600 rounded p-2 text-white"
                    value={formData.password}
                    onChange={(e) =>
                      setFormData({ ...formData, password: e.target.value })
                    }
                  />
                </div>
              )}

              <button
                onClick={handleSubmit}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded-lg mt-2 transition-colors"
              >
                Lưu Thay Đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
