"use client";

import React, { useState } from "react";
import {
  inspectUserAction,
  inspectGroupAction,
} from "@/lib/actions/debug.actions";
// [FIX] Sửa import default thành import named export (có ngoặc nhọn)
import { StyledText } from "@/app/components/ui/StyledText";

// --- Icons ---
const CopyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="green"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

// --- Sub-component: JSON Viewer with Copy ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const JsonDisplay = ({ title, data }: { title: string; data: any }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!data) return null;

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center justify-between bg-zinc-800 px-3 py-2 rounded-t-md border-b border-zinc-700">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          {title}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-zinc-400 hover:text-white hover:bg-zinc-700 rounded transition-colors"
          title="Copy raw JSON"
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
      <div className="bg-zinc-950 p-4 rounded-b-md overflow-auto max-h-[500px] border border-zinc-800 shadow-inner">
        <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
};

// --- Main Component ---
export default function DebugToolsPanel() {
  const [activeTab, setActiveTab] = useState<"user" | "group">("user");
  const [loading, setLoading] = useState(false);

  // Inputs
  const [botId, setBotId] = useState("");
  const [userId, setUserId] = useState("");
  const [phone, setPhone] = useState("");
  const [groupId, setGroupId] = useState("");

  // Outputs (Dùng unknown hoặc any có kiểm soát)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result, setResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [requestPayload, setRequestPayload] = useState<any>(null);

  const handleInspectUser = async () => {
    if (!botId) return alert("Vui lòng nhập Bot ID (IMEI hoặc ID trong DB)");
    setLoading(true);
    setResult(null);
    setRequestPayload(null);

    try {
      const res = await inspectUserAction(botId, {
        userId,
        phoneNumber: phone,
      });
      setResult(res.data || res.error);
      setRequestPayload(res.requestPayload);
    } catch (e) {
      setResult({ error: "Client Error", details: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const handleInspectGroup = async () => {
    if (!botId || !groupId) return alert("Vui lòng nhập Bot ID và Group ID");
    setLoading(true);
    setResult(null);
    setRequestPayload(null);

    try {
      const res = await inspectGroupAction(botId, groupId, userId); // userId here acts as targetMemberId
      setResult(res.data || res.error);
      setRequestPayload(res.requestPayload);
    } catch (e) {
      setResult({ error: "Client Error", details: String(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-white p-6 gap-6 overflow-hidden">
      {/* Header */}
      <div>
        <StyledText
          text="Zalo Protocol Debugger"
          className="text-2xl font-bold text-blue-400"
        />
        <p className="text-zinc-400 text-sm mt-1">
          Công cụ truy vấn trực tiếp Zalo Server để kiểm tra Schema, ID và Trạng
          thái.
        </p>
      </div>

      {/* Controls Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-0">
        {/* LEFT: Input Panel */}
        <div className="lg:col-span-1 bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 flex flex-col gap-5 h-fit">
          {/* Bot Context */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-400 uppercase">
              Bot Context (Required)
            </label>
            <input
              type="text"
              placeholder="Nhập Bot ID (UUID hoặc IMEI)..."
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white focus:border-blue-500 focus:outline-none"
            />
            <p className="text-[10px] text-zinc-500">
              Bot phải đang trạng thái LOGGED_IN.
            </p>
          </div>

          {/* Tabs */}
          <div className="flex bg-zinc-900 rounded p-1 border border-zinc-700">
            <button
              onClick={() => {
                setActiveTab("user");
                setResult(null);
              }}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                activeTab === "user"
                  ? "bg-blue-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Inspect User
            </button>
            <button
              onClick={() => {
                setActiveTab("group");
                setResult(null);
              }}
              className={`flex-1 py-1.5 text-sm font-medium rounded transition-all ${
                activeTab === "group"
                  ? "bg-purple-600 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Inspect Group
            </button>
          </div>

          {/* Dynamic Inputs based on Tab */}
          <div className="flex flex-col gap-4">
            {activeTab === "user" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="098... (Tìm UID từ SĐT)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">
                    User ID (Optional if phone provided)
                  </label>
                  <input
                    type="text"
                    placeholder="UID người cần soi..."
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                  />
                </div>
                <button
                  onClick={handleInspectUser}
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? "Đang truy vấn..." : "🔍 Scan User Data"}
                </button>
              </>
            )}

            {activeTab === "group" && (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">
                    Group ID (Required)
                  </label>
                  <input
                    type="text"
                    placeholder="Group ID..."
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-zinc-400">
                    Target Member ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Check role của ai? (Default: Bot)"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="bg-zinc-900 border border-zinc-700 rounded p-2 text-sm text-white"
                  />
                </div>
                <button
                  onClick={handleInspectGroup}
                  disabled={loading}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 rounded transition-colors disabled:opacity-50 mt-2"
                >
                  {loading ? "Đang truy vấn..." : "🛡️ Scan Group Data"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* RIGHT: Output Panel (Scrollable) */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2">
          {!result && !loading && (
            <div className="h-full flex items-center justify-center border border-dashed border-zinc-700 rounded-xl bg-zinc-800/20 text-zinc-500 text-sm">
              Kết quả truy vấn sẽ hiển thị ở đây...
            </div>
          )}

          {/* REQUEST PAYLOAD DISPLAY */}
          {requestPayload && (
            <JsonDisplay
              title="Request Payload (Input)"
              data={requestPayload}
            />
          )}

          {/* RESPONSE RESULT DISPLAY */}
          {result && (
            <JsonDisplay title="Response Data (Output)" data={result} />
          )}
        </div>
      </div>
    </div>
  );
}
