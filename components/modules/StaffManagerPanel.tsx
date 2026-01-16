/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useState, useEffect } from "react";
import {
  getAllStaffAction,
  createStaffAction,
  updateStaffAction,
  deleteStaffAction,
  changeStaffPasswordAction,
  getStaffBotPermissionsAction,
  assignBotPermissionAction,
  revokeBotPermissionAction,
} from "@/lib/actions/staff.actions";
import { getBotsAction } from "@/lib/actions/bot.actions";
import { Avatar } from "@/components/ui/Avatar";
import {
  IconUserPlus,
  IconRefresh,
  IconCog,
  IconClose,
  IconRobot,
} from "@/components/ui/Icons";
import { ZaloBot } from "@/lib/types/database.types";

export function StaffManagerPanel() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [staffList, setStaffList] = useState<any[]>([]);
  const [bots, setBots] = useState<ZaloBot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Modes: CREATE, EDIT, PASSWORD, PERMISSIONS
  const [modalMode, setModalMode] = useState<
    "CREATE" | "EDIT" | "PASSWORD" | "PERMISSIONS"
  >("CREATE");

  // Form State
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    full_name: "",
    role: "staff",
    phone: "",
  });

  // Permission State
  const [staffPermissions, setStaffPermissions] = useState<
    Record<string, string>
  >({});

  const fetchStaffAndBots = async () => {
    setIsLoading(true);
    try {
      const [staffData, botData] = await Promise.all([
        getAllStaffAction(),
        getBotsAction(),
      ]);
      setStaffList(staffData || []);
      setBots(botData || []);
    } catch (e) {
      alert("Lỗi tải danh sách: " + e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffAndBots();
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
    setStaffPermissions({});
  };

  const handleOpenCreate = () => {
    resetForm();
    setModalMode("CREATE");
    setIsModalOpen(true);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOpenPassword = (staff: any) => {
    setSelectedStaff(staff);
    setFormData({ ...formData, password: "" });
    setModalMode("PASSWORD");
    setIsModalOpen(true);
  };

  // [NEW] Open Permissions Modal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleOpenPermissions = async (staff: any) => {
    setSelectedStaff(staff);
    setModalMode("PERMISSIONS");
    setIsModalOpen(true);
    setStaffPermissions({});

    // Fetch current permissions
    const res = await getStaffBotPermissionsAction(staff.id);
    if (res.success && res.data) {
      const permMap: Record<string, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      res.data.forEach((p: any) => {
        permMap[p.bot_id] = p.permission_type;
      });
      setStaffPermissions(permMap);
    } else {
      alert("Không tải được quyền hạn: " + res.error);
    }
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
    } else if (modalMode === "PERMISSIONS") {
      // Permission logic handled separately per toggle, just close modal
      setIsModalOpen(false);
      return;
    }

    if (res?.success) {
      alert("Thành công!");
      setIsModalOpen(false);
      fetchStaffAndBots();
    } else if (res) {
      alert("Lỗi: " + res?.error);
    }
  };

  const handleTogglePermission = async (
    botId: string,
    currentPerm: string | undefined,
  ) => {
    if (!selectedStaff) return;

    // Logic toggle đơn giản: Chưa có -> Chat -> Revoke (Xóa) -> Chưa có
    // (Có thể mở rộng UI để chọn cụ thể 'auth' hay 'view_only' sau)
    // Hiện tại mặc định cấp quyền 'chat' (bao gồm cả view)

    if (currentPerm) {
      // Đang có quyền -> Thu hồi
      const res = await revokeBotPermissionAction(selectedStaff.id, botId);
      if (res.success) {
        const newMap = { ...staffPermissions };
        delete newMap[botId];
        setStaffPermissions(newMap);
      } else {
        alert(res.error);
      }
    } else {
      // Chưa có -> Cấp quyền 'chat'
      const res = await assignBotPermissionAction(
        selectedStaff.id,
        botId,
        "chat",
      );
      if (res.success) {
        setStaffPermissions((prev) => ({ ...prev, [botId]: "chat" }));
      } else {
        alert(res.error);
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Chắc chắn xóa nhân viên này?")) return;
    const res = await deleteStaffAction(id);
    if (res.success) fetchStaffAndBots();
    else alert(res.error);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleToggleActive = async (staff: any) => {
    const newState = !staff.is_active;
    await updateStaffAction(staff.id, { is_active: newState });
    fetchStaffAndBots();
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
            onClick={fetchStaffAndBots}
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
                    {/* [NEW] Nút Phân quyền Bot (Chỉ hiện cho Staff thường, Admin mặc định full quyền) */}
                    {staff.role !== "admin" && (
                      <button
                        onClick={() => handleOpenPermissions(staff)}
                        className="p-2 hover:bg-gray-700 rounded text-green-400"
                        title="Phân quyền Bot"
                      >
                        <IconRobot className="w-4 h-4" />
                      </button>
                    )}

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
          <div
            className={`bg-gray-800 w-full rounded-xl border border-gray-700 shadow-2xl overflow-hidden animate-scale-up ${
              modalMode === "PERMISSIONS" ? "max-w-2xl" : "max-w-md"
            }`}
          >
            <div className="p-4 bg-gray-900 border-b border-gray-700 flex justify-between items-center">
              <h3 className="font-bold text-white text-lg">
                {modalMode === "CREATE"
                  ? "Thêm Nhân viên"
                  : modalMode === "EDIT"
                  ? "Sửa thông tin"
                  : modalMode === "PASSWORD"
                  ? "Đổi mật khẩu"
                  : `Phân quyền Bot: ${selectedStaff?.username}`}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-white"
              >
                <IconClose className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {modalMode === "PERMISSIONS" ? (
                // --- PERMISSIONS UI ---
                <div className="flex flex-col gap-4">
                  <p className="text-sm text-gray-400">
                    Chọn các Bot mà nhân viên này được phép truy cập:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto">
                    {bots.map((bot) => {
                      const perm = staffPermissions[bot.id];
                      const isAssigned = !!perm;

                      return (
                        <div
                          key={bot.id}
                          className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                            isAssigned
                              ? "bg-blue-900/20 border-blue-500/50"
                              : "bg-gray-900 border-gray-700 hover:border-gray-500"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Avatar src={bot.avatar || ""} alt={bot.name} />
                            <div className="overflow-hidden">
                              <p className="text-sm font-bold text-white truncate max-w-[120px]">
                                {bot.name}
                              </p>
                              <p className="text-xs text-gray-500 font-mono truncate">
                                {/* [FIX] Type casting global_id */}
                                {(bot as any).global_id || "---"}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleTogglePermission(bot.id, perm)}
                            className={`w-10 h-6 rounded-full p-1 transition-colors flex items-center ${
                              isAssigned
                                ? "bg-blue-600 justify-end"
                                : "bg-gray-700 justify-start"
                            }`}
                          >
                            <div className="w-4 h-4 bg-white rounded-full shadow-sm" />
                          </button>
                        </div>
                      );
                    })}

                    {bots.length === 0 && (
                      <p className="text-gray-500 italic text-center col-span-2">
                        Chưa có Bot nào trong hệ thống.
                      </p>
                    )}
                  </div>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              ) : (
                // --- STANDARD CRUD UI ---
                <>
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
                            setFormData({
                              ...formData,
                              username: e.target.value,
                            })
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
                            setFormData({
                              ...formData,
                              full_name: e.target.value,
                            })
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
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
