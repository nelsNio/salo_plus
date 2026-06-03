package models

import (
	"time"

	"gorm.io/gorm"
)

type CierreCaja struct {
	gorm.Model
	FechaInicio               time.Time `json:"fecha_inicio"`
	FechaFin                  time.Time `json:"fecha_fin"`
	TotalVentasEfectivo       float64   `json:"total_ventas_efectivo"`
	TotalVentasTransferencia  float64   `json:"total_ventas_transferencia"`
	TotalVentas               float64   `json:"total_ventas"`
	TotalDescuentos           float64   `json:"total_descuentos"`
	TotalEgresosEfectivo      float64   `json:"total_egresos_efectivo"`
	TotalEgresosTransferencia float64   `json:"total_egresos_transferencia"`
	TotalEgresos              float64   `json:"total_egresos"`
	NetoCaja                  float64   `json:"neto_caja"` // ventas efectivo - egresos efectivo
	Observacion               string    `json:"observacion"`
}
