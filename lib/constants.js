export const SALARY_KEYS = ["basic", "hra", "transport", "medical"];
export const DEFAULT_SALARY_LABELS = {
  basic: "Basic",
  hra: "HRA",
  transport: "Transport",
  medical: "Medical",
};

export const getSalaryLabels = (settings) => ({
  ...DEFAULT_SALARY_LABELS,
  ...(settings?.salaryTypeLabels || {}),
});
