import { useState, type FormEvent } from "react";

import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { CATEGORY_LABELS, CONDITION_LABELS } from "@/lib/listingLabels";
import type { ListingCategory, ListingCondition } from "@/api/types";

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));
const CONDITION_OPTIONS = Object.entries(CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export interface ListingFormValues {
  title: string;
  author: string;
  description: string;
  category: ListingCategory | "";
  condition: ListingCondition | "";
  price: string;
}

export const EMPTY_LISTING_FORM_VALUES: ListingFormValues = {
  title: "",
  author: "",
  description: "",
  category: "",
  condition: "",
  price: "",
};

export interface ListingFormProps {
  initialValues: ListingFormValues;
  onSubmit: (values: {
    title: string;
    author: string;
    description: string;
    category: ListingCategory;
    condition: ListingCondition;
    price: number;
  }) => Promise<void>;
  submitLabel: string;
  isSubmitting: boolean;
  serverFieldErrors?: Record<string, string>;
  children?: React.ReactNode;
}

/**
 * Shared by `CreateListingPage` and `EditListingPage` (FR-020/FR-021) — the
 * two pages differ in what happens around the form (fetching an existing
 * listing, ownership/status guards, image upload placement) but the field
 * set and its validation are identical.
 */
export function ListingForm({
  initialValues,
  onSubmit,
  submitLabel,
  isSubmitting,
  serverFieldErrors = {},
  children,
}: ListingFormProps): React.JSX.Element {
  const [values, setValues] = useState(initialValues);
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});

  function set<K extends keyof ListingFormValues>(key: K, value: ListingFormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // FE-020: required fields, price > 0 — checked client-side in addition
    // to (never instead of) the server's identical validation.
    const errors: Record<string, string> = {};
    if (!values.title.trim()) errors.title = "Title is required.";
    if (!values.author.trim()) errors.author = "Author is required.";
    if (!values.description.trim()) errors.description = "Description is required.";
    if (!values.category) errors.category = "Category is required.";
    if (!values.condition) errors.condition = "Condition is required.";
    const priceNumber = Number(values.price);
    if (!values.price || Number.isNaN(priceNumber) || priceNumber <= 0) {
      errors.price = "Price must be greater than 0.";
    }
    setClientErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    await onSubmit({
      title: values.title,
      author: values.author,
      description: values.description,
      category: values.category as ListingCategory,
      condition: values.condition as ListingCondition,
      price: priceNumber,
    });
  }

  const fieldError = (field: string): string | undefined => clientErrors[field] ?? serverFieldErrors[field];

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <Input
        label="Title"
        required
        value={values.title}
        onChange={(e) => set("title", e.target.value)}
        error={fieldError("title")}
      />
      <Input
        label="Author"
        required
        value={values.author}
        onChange={(e) => set("author", e.target.value)}
        error={fieldError("author")}
      />
      <div className="flex flex-col gap-1">
        <label htmlFor="listing-description" className="text-sm font-medium text-slate-800">
          Description<span aria-hidden="true" className="ml-0.5 text-red-700">*</span>
        </label>
        <textarea
          id="listing-description"
          required
          rows={5}
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          aria-invalid={fieldError("description") ? true : undefined}
          aria-describedby={fieldError("description") ? "listing-description-error" : undefined}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus-visible:outline-none"
        />
        {fieldError("description") && (
          <p id="listing-description-error" role="alert" className="text-xs font-medium text-red-700">
            {fieldError("description")}
          </p>
        )}
      </div>
      <Select
        label="Category"
        placeholder="Select a category"
        required
        options={CATEGORY_OPTIONS}
        value={values.category}
        onChange={(e) => set("category", e.target.value as ListingCategory)}
        error={fieldError("category")}
      />
      <Select
        label="Condition"
        placeholder="Select a condition"
        required
        options={CONDITION_OPTIONS}
        value={values.condition}
        onChange={(e) => set("condition", e.target.value as ListingCondition)}
        error={fieldError("condition")}
      />
      <Input
        label="Price"
        type="number"
        min="0.01"
        step="0.01"
        required
        value={values.price}
        onChange={(e) => set("price", e.target.value)}
        error={fieldError("price")}
      />
      {children}
      <Button type="submit" isLoading={isSubmitting}>
        {submitLabel}
      </Button>
    </form>
  );
}
