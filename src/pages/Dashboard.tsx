import { DashboardProvider } from "@/contexts/dashboard";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";

const Dashboard = () => (
  <DashboardProvider>
    <DashboardLayout />
  </DashboardProvider>
);

export default Dashboard;
