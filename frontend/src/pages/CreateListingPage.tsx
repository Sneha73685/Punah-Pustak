import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Card } from "@/components/Card";
import { EMPTY_LISTING_FORM_VALUES, ListingForm } from "@/components/ListingForm";
import { ImageUploadField } from "@/components/ImageUploadField";
import { useCreateListing, useUploadListingImages } from "@/hooks/useListings";
import { toFormErrors } from "@/lib/formErrors";
import type { ListingCategory, ListingCondition } from "@/api/types";

/** FR-020, UC-2: create a listing, then (optionally) upload its images in a
 * follow-up call — the API creates a listing with zero images and images
 * are a separate multipart endpoint (API-030), so there is no single
 * request that does both. */
export function CreateListingPage(): React.JSX.Element {
  const navigate = useNavigate();
  const createMutation = useCreateListing();
  const uploadMutation = useUploadListingImages();
  const [images, setImages] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({});
  // Set once the listing itself is successfully created. Tracked so that if
  // only the *image upload* then fails (a validation error — oversized
  // file, wrong type, over the 6-image cap — is the expected, correctable
  // case here), clicking submit again retries just the image upload
  // instead of re-running `createMutation` and creating a second, duplicate
  // listing.
  const [createdListingId, setCreatedListingId] = useState<string | null>(null);

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
      let listingId = createdListingId;
      if (!listingId) {
        const listing = await createMutation.mutateAsync(values);
        listingId = listing.id;
        setCreatedListingId(listing.id);
      }
      if (images.length > 0) {
        await uploadMutation.mutateAsync({ id: listingId, files: images });
      }
      navigate(`/listings/${listingId}`);
    } catch (error) {
      const { fields, formMessage } = toFormErrors(error);
      setServerFieldErrors(fields);
      setFormError(formMessage);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <Card>
        <h1 className="text-xl font-semibold text-slate-900">Create listing</h1>
        <div className="mt-4">
          <ListingForm
            initialValues={EMPTY_LISTING_FORM_VALUES}
            onSubmit={handleSubmit}
            submitLabel="Create listing"
            isSubmitting={createMutation.isPending || uploadMutation.isPending}
            serverFieldErrors={serverFieldErrors}
          >
            <ImageUploadField
              existingCount={0}
              files={images}
              onFilesChange={setImages}
              error={serverFieldErrors.images}
            />
            {createdListingId && (
              <p className="text-sm text-slate-500">
                Your listing was saved. Fix the image issue below and submit again to finish adding
                photos, or come back to it later from My Listings.
              </p>
            )}
            {formError && (
              <p role="alert" className="text-sm font-medium text-red-700">
                {formError}
              </p>
            )}
          </ListingForm>
        </div>
      </Card>
    </div>
  );
}
