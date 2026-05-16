// Upload form: file input, expected-value fields, beverage type, import toggle, submit (Phase 1.6).
"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  BEVERAGE_TYPES,
  ExpectedValuesSchema,
  type ExpectedValues,
  type ExpectedValuesInput,
} from "@/lib/schema";

export type UploadSubmitPayload = {
  image: File;
  expected: ExpectedValues;
};

export type UploadFormProps = {
  busy?: boolean;
  onSubmit: (payload: UploadSubmitPayload) => void;
};

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPT_ATTR = "image/jpeg,image/png";

const BEVERAGE_LABELS: Record<(typeof BEVERAGE_TYPES)[number], string> = {
  beer: "Beer",
  wine: "Wine",
  distilled_spirits: "Distilled spirits",
};

const DEFAULT_VALUES: ExpectedValuesInput = {
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  bottlerNameAddress: "",
  beverageType: "distilled_spirits",
  isImport: false,
  countryOfOrigin: "",
};

export function UploadForm({ busy = false, onSubmit }: UploadFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isValid },
  } = useForm<ExpectedValuesInput, unknown, ExpectedValues>({
    resolver: zodResolver(ExpectedValuesSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onChange",
  });

  // useWatch (vs the bare `watch` getter) is the React-Compiler-safe API; the bare
  // getter returns a function the compiler can't memoize, so it bails on the component.
  const isImport = useWatch({ control, name: "isImport" });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    if (!file) {
      setImageFile(null);
      setImageError(null);
      setPreviewUrl(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
      setImageFile(null);
      setPreviewUrl(null);
      setImageError("Please upload a JPEG or PNG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setImageFile(null);
      setPreviewUrl(null);
      setImageError(`Image must be 10 MB or smaller. Selected file is ${mb} MB.`);
      return;
    }
    setImageError(null);
    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  function onValid(values: ExpectedValues) {
    if (!imageFile) {
      setImageError("Please attach a label image before submitting.");
      return;
    }
    onSubmit({ image: imageFile, expected: values });
  }

  const submitDisabled = busy || !isValid || !imageFile;

  return (
    <form onSubmit={handleSubmit(onValid)} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="image-input" className="text-base">
          Label image (JPEG or PNG, ≤ 10 MB)
        </Label>
        <input
          ref={fileInputRef}
          id="image-input"
          type="file"
          accept={ACCEPT_ATTR}
          onChange={handleFileChange}
          disabled={busy}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted"
        />
        {imageError ? (
          <p role="alert" className="text-sm text-destructive">
            {imageError}
          </p>
        ) : null}
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview of a user-supplied blob URL; next/image can't optimize blobs.
          <img
            src={previewUrl}
            alt="Selected label preview"
            className="mt-2 max-h-72 w-auto rounded-md border border-input object-contain"
          />
        ) : null}
      </div>

      <FieldGroup
        id="brandName"
        label="Brand name"
        error={errors.brandName?.message}
        {...register("brandName")}
        disabled={busy}
      />
      <FieldGroup
        id="classType"
        label="Class / type designation"
        error={errors.classType?.message}
        {...register("classType")}
        disabled={busy}
      />
      <FieldGroup
        id="alcoholContent"
        label="Alcohol content (ABV)"
        placeholder="e.g. 45% Alc./Vol."
        error={errors.alcoholContent?.message}
        {...register("alcoholContent")}
        disabled={busy}
      />
      <FieldGroup
        id="netContents"
        label="Net contents"
        placeholder="e.g. 750 mL"
        error={errors.netContents?.message}
        {...register("netContents")}
        disabled={busy}
      />
      <FieldGroup
        id="bottlerNameAddress"
        label="Name and address of bottler or producer"
        error={errors.bottlerNameAddress?.message}
        {...register("bottlerNameAddress")}
        disabled={busy}
      />

      <div className="flex flex-col gap-2">
        <Label className="text-base">Beverage type</Label>
        <Controller
          control={control}
          name="beverageType"
          render={({ field }) => (
            <RadioGroup
              value={field.value}
              onValueChange={(value: string) =>
                field.onChange(value as ExpectedValuesInput["beverageType"])
              }
              disabled={busy}
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {BEVERAGE_TYPES.map((bev) => (
                <Label
                  key={bev}
                  htmlFor={`beverage-${bev}`}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 py-2"
                >
                  <RadioGroupItem id={`beverage-${bev}`} value={bev} />
                  <span>{BEVERAGE_LABELS[bev]}</span>
                </Label>
              ))}
            </RadioGroup>
          )}
        />
        {errors.beverageType?.message ? (
          <p role="alert" className="text-sm text-destructive">
            {errors.beverageType.message}
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-md border border-input bg-background px-3 py-3">
        <div className="flex flex-col">
          <Label htmlFor="isImport" className="text-base">
            Is this an imported product?
          </Label>
          <p className="text-sm text-muted-foreground">
            Turn on to require a country of origin.
          </p>
        </div>
        <Controller
          control={control}
          name="isImport"
          render={({ field }) => (
            <Switch
              id="isImport"
              checked={field.value}
              onCheckedChange={field.onChange}
              disabled={busy}
            />
          )}
        />
      </div>

      {isImport ? (
        <FieldGroup
          id="countryOfOrigin"
          label="Country of origin"
          error={errors.countryOfOrigin?.message}
          {...register("countryOfOrigin")}
          disabled={busy}
        />
      ) : null}

      <Button type="submit" disabled={submitDisabled} size="lg" className="self-start">
        {busy ? "Verifying..." : "Verify label"}
      </Button>
    </form>
  );
}

type FieldGroupProps = React.InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  error?: string;
  // React 19 passes refs as plain props, so react-hook-form's register({...}) ref
  // flows straight through to Input.
  ref?: React.Ref<HTMLInputElement>;
};

function FieldGroup({ id, label, error, ref, ...inputProps }: FieldGroupProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      <Input id={id} ref={ref} aria-invalid={Boolean(error)} {...inputProps} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
