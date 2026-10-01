import React, { useState, useEffect } from "react";
import { Leaf, ChevronDown, User, Activity } from "lucide-react";
import { useSafety } from "../context/SafetyContext";

export default function Navbar() {
  const { streamSource } = useSafety();
  const [timeStr, setTimeStr] = useState("");
  const [dateStr, setDateStr] = useState("");

  useEffect(() => {
    const updateClock = () => {
      const d = new Date();
      setDateStr(d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }));
      setTimeStr(d.toLocaleTimeString("en-US", { hour12: false }) + " (IST)");
    };
    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 border-b border-slate-200 bg-white px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs text-slate-800">
      {/* App Brand & India Glycols Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
          <Leaf className="w-5 h-5 fill-emerald-600 text-emerald-600" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold tracking-tight text-base text-slate-900 font-sans uppercase">
              INDIA GLYCOLS LIMITED
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-tight">
            Green Chemicals. A Sustainable Tomorrow.
          </p>
        </div>
      </div>

      {/* Right Controls Header Bar */}
      <div className="flex items-center gap-4 text-xs">
        {/* Plant Feed Dropdown */}
        <div className="relative hidden md:block">
          <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition">
            <span>{streamSource ? streamSource.name : "Plant / Feed not configured"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {/* System Online Status */}
        <div className="hidden lg:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-emerald-50/80 border border-emerald-200/80 text-emerald-800">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
          <div>
            <div className="font-bold text-[11px]">System Online</div>
            <div className="text-[10px] text-emerald-700/90 font-medium">All services operational</div>
          </div>
        </div>

        {/* Date & Time IST */}
        <div className="hidden sm:flex flex-col items-end px-3 py-1 border-l border-slate-200 text-slate-600 font-sans">
          <span className="font-bold text-slate-800 text-[11px]">{dateStr}</span>
          <span className="text-[10px] text-slate-500 font-mono">{timeStr}</span>
        </div>

        {/* User Admin Badge */}
        <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600">
            <User className="w-4 h-4" />
          </div>
          <div className="hidden xl:block text-left">
            <div className="font-bold text-[11px] text-slate-900 leading-tight">EHS Admin</div>
            <div className="text-[10px] text-slate-500 font-medium leading-tight">Administrator</div>
          </div>
        </div>
      </div>
    </header>
  );
}
