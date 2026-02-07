export type EstimateType = "unit_price" | "historical_api_price";

export type EstimateSource = "pricing" | "estimate" | "fallback";

export interface CostMetadata {
	currency: string;
	unit?: string;
	unitQuantity?: number;
	estimateType: EstimateType;
	estimateSource: EstimateSource;
	endpointId: string;
	unitPrice?: number;
}
