import Link from "next/link";
import { EmptyState } from "@/components/state/empty-state";
import { Button } from "@/components/ui/button";

export default function ScholarProfileNotFound() {
   return (
      <main className="mx-auto max-w-xl px-4 py-16">
         <EmptyState
            title="Scholar Not Found"
            description="The requested scholar profile does not exist or may have been renamed."
            action={
               <Button asChild className="rounded-xl">
                  <Link href="/">Back to Home</Link>
               </Button>
            }
         />
      </main>
   );
}
