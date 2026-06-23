import dynamic from "next/dynamic";
import { SettingsSkeleton } from "@/components/ui/skeletons";

const SettingsClient = dynamic(() => import("./settings-client"), {
  loading: () => <SettingsSkeleton />,
});

export default function SettingsPage() {
  return <SettingsClient />;
}
