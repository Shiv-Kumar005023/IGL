import React from "react";
import { SafetyProvider, useSafety } from "./context/SafetyContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import RealInputBanner from "./components/RealInputBanner";
import EvidenceModal from "./components/EvidenceModal";

import DashboardView from "./views/DashboardView";
import CameraInputView from "./views/CameraInputView";
import LiveMonitoringView from "./views/LiveMonitoringView";
import ExpectedPersonnelView from "./views/ExpectedPersonnelView";
import PackagingInspectionView from "./views/PackagingInspectionView";
import AlertsView from "./views/AlertsView";
import PersonnelAnomalyView from "./views/PersonnelAnomalyView";
import PersonnelMonitoringView from "./views/PersonnelMonitoringView";
import ImageCameraInspectionView from "./views/ImageCameraInspectionView";
import NearMissView from "./views/NearMissView";
import CameraHealthView from "./views/CameraHealthView";
import AnalyticsView from "./views/AnalyticsView";
import ConfigurationView from "./views/ConfigurationView";

function MainContent() {
  const { activeTab } = useSafety();

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 pb-12">
      {activeTab === "dashboard" && <DashboardView />}
      {activeTab === "camera-input" && <CameraInputView />}
      {activeTab === "live-monitoring" && <LiveMonitoringView />}
      {activeTab === "expected-personnel" && <ExpectedPersonnelView />}
      {activeTab === "personnel-monitoring" && <PersonnelMonitoringView />}
      {activeTab === "image-camera-inspection" && <ImageCameraInspectionView />}
      {activeTab === "packaging" && <PackagingInspectionView />}
      {activeTab === "alerts" && <AlertsView />}
      {activeTab === "personnel" && <PersonnelAnomalyView />}
      {activeTab === "near-miss" && <NearMissView />}
      {activeTab === "camera-health" && <CameraHealthView />}
      {activeTab === "analytics" && <AnalyticsView />}
      {activeTab === "config" && <ConfigurationView />}
    </main>
  );
}

export default function App() {
  return (
    <SafetyProvider>
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
        <Navbar />
        <RealInputBanner />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
        <EvidenceModal />
      </div>
    </SafetyProvider>
  );
}
