package models

import (
	"time"

	"gorm.io/gorm"
)

type Egreso struct {
	gorm.Model
	Fecha       time.Time `json:"fecha"`
	Concepto    string    `json:"concepto"`
	Monto       float64   `json:"monto"`
	Tipo        string    `json:"tipo"`        // gasto_operativo, pago_proveedor, retiro, servicio, otro
	TipoPago    string    `json:"tipo_pago"`   // efectivo, transferencia
	Descripcion string    `json:"descripcion"`
}
