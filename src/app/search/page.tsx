import dynamic from "next/dynamic";
import { SearchSkeleton } from "@/components/ui/skeletons";

const SearchClient = dynamic(() => import("./search-client"), {
  loading: () => <SearchSkeleton />,
});

export default function SearchPage() {
  return <SearchClient />;
}
