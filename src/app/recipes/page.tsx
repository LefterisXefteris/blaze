import dynamic from "next/dynamic";
import { RecipesSkeleton } from "@/components/ui/skeletons";

const RecipesClient = dynamic(() => import("./recipes-client"), {
  loading: () => <RecipesSkeleton />,
});

export default function RecipesPage() {
  return <RecipesClient />;
}
