package models

import "gorm.io/gorm"

// Counter is a simple key-value counter used for sequential numbers (e.g., folios)
type Counter struct {
	gorm.Model
	Name  string `gorm:"uniqueIndex" json:"name"`
	Value uint   `json:"value"`
}
