import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { Card } from "@/components/Card";
import { ImageUploadField } from "@/components/ImageUploadField";
import { ListingForm } from "@/components/ListingForm";
import { QueryState } from "@/components/QueryState";
import { useListing, useUpdateListing, useUploadListingImages } from "@/hooks/useListings";
import { toFormErrors } from "@/lib/formErrors";
import type { ListingCategory, ListingCondition } from "@/api/types";

/** FR-021/FR-028, UC-2: editing is only offered while `status === "available"`
 * and only to the listing's owner — both are also enforced server-side, so
 * this page's guards are UX, not the security boundary (§8.3). There is no
 * image-delete/reorder endpoint, so this page only ever *adds* images, up to
 * the existing FR-030 cap of 6 total. */
export function EditListingPage(): React.JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { state } = useAuth();
  const query = useListing(id ?? "");
  const updateMutation = useUpdateListing(id ?? "");
  const uploadMutation = useUploadListingImages();
  const [images, setImages] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});

  const listing = query.data;
  const isOwner =
    state.status === "authenticated" && listing !== undefined && state.user.id === listing.owner_id;

  async function handleSubmit(values: {
    title: string;
    author: string;
    description: string;
    category: ListingCategory;
    condition: ListingCondition;
    price: number;
  }): Promise<void> {
    setFormError(null);
    setServerFieldErrors({});
    try {
      await updateMutation.mutateAsync(values);
      if (images.length > 0 && id) {
        // Deliberately not swallowed: a validation failure here (oversized
        // file, wrong type, over the 6-image cap) is the expected,
        // correctable case, and the listing's own fields were already
        // saved successfully — falls through to the same catch below,
        // which maps it onto `ImageUploadField` via `serverFieldErrors.images`
        // instead of silently navigating away with no indication anything
        // failed.
        await uploadMutation.mutateAsync({ id, files: images });
      }
      navigate(`/listings/${id ?? ""}`);
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setServerFieldErrors(fields);
      setFormError(formMessage);
    }
  }

  return (
    <QueryState isLoading={query.isPending} error={query.error}>
      {listing && !isOwner && (
        <p role="alert" className="text-sm font-medium text-red-700">
          You don&apos;t have permission to edit this listing.
        </p>
      )}
      {listing && isOwner && listing.status !== "available" && (
        <div className="mx-auto max-w-lg">
          <Card>
            <p className="text-sm text-slate-700">
              This listing is {listing.status} and can no longer be edited.
            </p>
            <Link
              to={`/listings/${listing.id}`}
              className="mt-2 inline-block font-medium text-blue-700 hover:underline"
            >
              Back to listing
            </Link>
          </Card>
        </div>
      )}
      {listing && isOwner && listing.status === "available" && (
        <div className="mx-auto max-w-lg">
          <Card>
            <h1 className="text-xl font-semibold text-slate-900">Edit listing</h1>
            <div className="mt-4">
              <ListingForm
                initialValues={{
                  title: listing.title,
                  author: listing.author,
                  description: listing.description,
                  category: listing.category,
                  condition: listing.condition,
                  price: String(listing.price),
                }}
                onSubmit={handleSubmit}
                submitLabel="Save changes"
                isSubmitting={updateMutation.isPending || uploadMutation.isPending}
                serverFieldErrors={serverFieldErrors}
              >
                <ImageUploadField
                  existingCount={listing.images.length}
                  files={images}
                  onFilesChange={setImages}
                  error={serverFieldErrors.images}
                />
                {formError && (
                  <p role="alert" className="text-sm font-medium text-red-700">
                    {formError}
                  </p>
                )}
              </ListingForm>
            </div>
          </Card>
        </div>
      )}
    </QueryState>
  );
}
