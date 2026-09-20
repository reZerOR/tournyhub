import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function SetupSectionPlaceholder({ title }: { title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle aria-level={2} role="heading">
          {title}
        </CardTitle>
        <CardDescription>This section arrives in a later step.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          The Basics section is available now. Come back here once this part of
          setup ships.
        </p>
      </CardContent>
    </Card>
  );
}
