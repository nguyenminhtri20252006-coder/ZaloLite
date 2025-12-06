"use client";

/**
 * app/components/modules/UserDatabasePanel.tsx
 * [UPDATED] Database-First CRM View.
 * Hiển thị danh sách khách hàng từ DB, hỗ trợ chỉnh sửa Tag/Note.
 */
import { useState, useEffect } from "react";
import { Avatar } from "@/app/components/ui/Avatar";
import {
  IconUsers,
  IconRefresh,
  IconSearch,
  IconCheck,
} from "@/app/components/ui/Icons";
import {
  getCustomersFromDBAction,
  updateCustomerCRMAction,
  CustomerCRMView,
} from "@/lib/actions/crm.actions";
import { syncBotDataAction } from "@/lib/actions/bot.actions";

export function UserDatabasePanel({
  botId, // Cần botId để load data
}: {
  botId: string | null;
}) {
  const [customers, setCustomers] = useState<CustomerCRMView[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // State Edit CRM
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editNote, setEditNote] = useState("");
  const [editTags, setEditTags] = useState("");

  // --- DATA FETCHING ---
  const fetchData = async () => {
    if (!botId) return;
    setIsLoading(true);
    try {
      const data = await getCustomersFromDBAction(botId, 100, 1, searchTerm);
      setCustomers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botId]); // Reload khi đổi bot

  const handleSearch = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") fetchData();
  };

  const handleSync = async () => {
    if (!botId) return;
    setIsSyncing(true);
    try {
      await syncBotDataAction(botId);
      setTimeout(fetchData, 2000); // Đợi sync xong rồi reload nhẹ
    } catch (e) {
      alert("Lỗi đồng bộ");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- CRM ACTIONS ---
  const startEdit = (c: CustomerCRMView) => {
    setEditingId(c.id);
    setEditNote(c.notes || "");
    setEditTags(c.tags?.join(", ") || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    // Parse tags
    const tagsArray = editTags
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t);

    const res = await updateCustomerCRMAction(editingId, {
      notes: editNote,
      tags: tagsArray,
    });

    if (res.success) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === editingId ? { ...c, notes: editNote, tags: tagsArray } : c,
        ),
      );
      setEditingId(null);
    } else {
      alert("Lỗi lưu: " + res.error);
    }
  };

  if (!botId) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <IconUsers className="w-12 h-12 mb-2 opacity-20" />
        <p>Vui lòng chọn Bot để xem dữ liệu CRM.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-100">
      {/* Header */}
      <div className="p-6 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-white">CRM Khách Hàng</h2>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 text-blue-400 rounded-lg hover:bg-blue-900/50 text-sm transition-all"
          >
            <IconRefresh
              className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
            />
            {isSyncing ? "Đang đồng bộ..." : "Sync Zalo"}
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={handleSearch}
            placeholder="Tìm theo tên, SĐT... (Enter để tìm)"
            className="w-full bg-gray-800 border border-gray-700 rounded-xl py-3 pl-10 pr-4 text-white focus:border-blue-500 focus:outline-none"
          />
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex justify-center mt-10">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            Không tìm thấy khách hàng nào.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {customers.map((c) => (
              <div
                key={c.id}
                className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-gray-600 transition-all shadow-sm flex flex-col"
              >
                {/* Info Header */}
                <div className="flex items-start gap-3 mb-3">
                  <Avatar src={c.avatar || ""} alt={c.display_name || ""} />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white truncate">
                      {c.display_name}
                    </h3>
                    <p className="text-xs text-gray-400 font-mono truncate">
                      {c.global_id}
                    </p>
                    {c.phone && (
                      <p className="text-xs text-yellow-500 mt-0.5">
                        {c.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* CRM Edit Area */}
                {editingId === c.id ? (
                  <div className="flex-1 flex flex-col gap-2 animate-fade-in">
                    <input
                      value={editTags}
                      onChange={(e) => setEditTags(e.target.value)}
                      placeholder="Tags (cách nhau dấu phẩy)"
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white"
                    />
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Ghi chú..."
                      rows={2}
                      className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white resize-none"
                    />
                    <div className="flex gap-2 justify-end mt-1">
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-xs text-gray-400 hover:text-white"
                      >
                        Huỷ
                      </button>
                      <button
                        onClick={saveEdit}
                        className="text-xs bg-blue-600 px-2 py-1 rounded text-white font-bold"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex-1 flex flex-col gap-2"
                    onClick={() => startEdit(c)}
                  >
                    {/* Tags Display */}
                    <div className="flex flex-wrap gap-1 min-h-[20px]">
                      {c.tags && c.tags.length > 0 ? (
                        c.tags.map((tag, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full bg-blue-900/30 border border-blue-800 text-[10px] text-blue-300"
                          >
                            #{tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-600 italic border border-dashed border-gray-700 px-2 rounded">
                          + Thêm tag
                        </span>
                      )}
                    </div>

                    {/* Notes Display */}
                    <div className="bg-gray-900/50 rounded p-2 min-h-[40px] cursor-text hover:bg-gray-900 transition-colors">
                      {c.notes ? (
                        <p className="text-xs text-gray-300 line-clamp-3">
                          {c.notes}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-600 italic">
                          Chưa có ghi chú...
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-700/50 flex justify-between items-center">
                  <span className="text-[10px] text-gray-500">
                    Tương tác:{" "}
                    {c.last_interaction
                      ? new Date(c.last_interaction).toLocaleDateString()
                      : "Chưa rõ"}
                  </span>
                  {/* Có thể thêm nút Chat nhanh ở đây */}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
