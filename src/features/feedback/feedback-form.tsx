"use client";

import { usePathname } from "next/navigation";
import { type FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_LIMITS,
  type FeedbackCategory,
} from "@/domain/feedback";
import { submitFeedbackAction } from "@/features/feedback/feedback-actions";

const INPUT_CLASS =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/**
 * The beta feedback form. It sends only the category, the message, and the
 * current page; the page is derived from the URL rather than typed, so a report
 * cannot be pointed at another Auction or carry a token in a query string.
 */
export function FeedbackForm({ page }: { page?: string }) {
  const pathname = usePathname();
  const reportedPage = page ?? pathname;
  const [category, setCategory] = useState<FeedbackCategory>(
    FEEDBACK_CATEGORIES[0],
  );
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<null | string>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setSaved(false);
    const result = await submitFeedbackAction({
      category,
      message,
      page: reportedPage,
    });
    setPending(false);
    if (result.status === "saved") {
      setMessage("");
      setSaved(true);
    } else {
      setErrorMessage(result.message);
    }
  }

  const tooShort = message.trim().length < FEEDBACK_LIMITS.messageMin;

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <Field className="max-w-xs">
        <FieldLabel htmlFor="feedback-category">Category</FieldLabel>
        <Select
          items={FEEDBACK_CATEGORIES.map((val) => ({
            label: FEEDBACK_CATEGORY_LABELS[val],
            value: val,
          }))}
          onValueChange={(val) => val && setCategory(val as FeedbackCategory)}
          value={category}
        >
          <SelectTrigger className="w-full" id="feedback-category">
            <SelectValue>
              {(val: string | null) =>
                val && val in FEEDBACK_CATEGORY_LABELS
                  ? FEEDBACK_CATEGORY_LABELS[val as FeedbackCategory]
                  : undefined
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {FEEDBACK_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {FEEDBACK_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>

      <Field data-invalid={Boolean(errorMessage)}>
        <FieldLabel htmlFor="feedback-message">What happened?</FieldLabel>
        <textarea
          aria-describedby="feedback-message-help"
          aria-invalid={Boolean(errorMessage)}
          className={INPUT_CLASS}
          id="feedback-message"
          maxLength={FEEDBACK_LIMITS.messageMax}
          onChange={(event) => setMessage(event.target.value)}
          value={message}
        />
        <p className="text-sm text-muted-foreground" id="feedback-message-help">
          Reported from {reportedPage}. Do not include phone numbers, codes, or
          invitation links.
        </p>
      </Field>

      {errorMessage && <FieldError>{errorMessage}</FieldError>}

      <p aria-live="polite" className="text-sm" role="status">
        {pending
          ? "Sending…"
          : saved
            ? "Thank you. Your report was recorded."
            : ""}
      </p>

      <div>
        <Button disabled={pending || tooShort} type="submit">
          {pending && <Spinner data-icon="inline-start" />}
          Send feedback
        </Button>
      </div>
    </form>
  );
}
