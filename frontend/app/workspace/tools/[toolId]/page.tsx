import Client from "./Client";
import { toolStaticParams } from "@/lib/staticParams";

export function generateStaticParams() {
  return toolStaticParams();
}

export default function Page() {
  return <Client />;
}
