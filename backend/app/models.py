import datetime as dt

from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime,
    ForeignKey,
    JSON,
    Boolean,
)
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    organization = Column(String, nullable=False, default="farmer")
    contact = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    demand_records = relationship("DemandRecord", back_populates="owner", cascade="all, delete-orphan")
    training_runs = relationship("TrainingRun", back_populates="owner", cascade="all, delete-orphan")


class DemandRecord(Base):
    __tablename__ = "demand_records"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    date = Column(Date, nullable=False, index=True)
    demand = Column(Float, nullable=False)
    avg_price = Column(Float, nullable=True)
    cost_price = Column(Float, nullable=True)
    production_volume = Column(Float, nullable=True)
    season = Column(String, nullable=True)
    is_holiday = Column(Boolean, default=False)
    avg_temp = Column(Float, nullable=True)
    rainfall = Column(Float, nullable=True)
    tourists = Column(Float, nullable=True)
    channel = Column(String, nullable=True)
    has_promotion = Column(Boolean, default=False)
    note = Column(String, nullable=True)

    owner = relationship("User", back_populates="demand_records")


class TrainingRun(Base):
    __tablename__ = "training_runs"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    model_type = Column(String, nullable=False)  # random_forest | xgboost | lightgbm
    horizon_days = Column(Integer, nullable=False, default=30)
    train_size = Column(Integer, nullable=True)
    test_size = Column(Integer, nullable=True)
    mae = Column(Float, nullable=False)
    rmse = Column(Float, nullable=False)
    mape = Column(Float, nullable=False)
    r2 = Column(Float, nullable=False)
    feature_importance = Column(JSON, nullable=True)
    residual_std = Column(Float, nullable=True)
    parameters = Column(JSON, nullable=True)
    hyperparameters_tuned = Column(Boolean, default=False)
    assumptions_for_future_features = Column(String, nullable=True)
    trained_at = Column(DateTime, default=dt.datetime.utcnow)

    owner = relationship("User", back_populates="training_runs")
