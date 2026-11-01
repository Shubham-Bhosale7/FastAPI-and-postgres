"""
Python will interact with PostgreSQL directly without any FastAPI routes or endpoints
"""
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text, Column, String, Integer
from sqlalchemy.orm import DeclarativeBase, sessionmaker

#Step-1 get the url from .env file
load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")
print(DATABASE_URL)

#step-2 create engine=the road to the database
engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    version = conn.execute(text("SELECT version()")).scalar()
    print(f"Connect to {version.split(",")[0]}")
    
#.all() -> every row
#.first() only the first row
#.scalar() only the first value of the first row


"""
DeclarativeBase is the Parent class from SQLALchemy that turn a normal python class into a database table

Declartive : You declare(describe) what a table looks like
Base       : It's the Parent class everything else built on top of this.
"""
class Base(DeclarativeBase):
    pass

class StudentDB(Base):
    __tablename__ = "student_records"
    id      = Column(String, primary_key=True)
    name    = Column(String(50), nullable=False)
    age     = Column(Integer, nullable=False)
    course  = Column(String(50), nullable=False)
    marks   = Column(Integer, nullable=False)
    email   = Column(String, unique=True, nullable=False)  


#bind=engine -> every session travels to this road
Base.metadata.create_all(bind=engine)
print("Table ready...")


#Step 4: Session = One Visit, Open, do work, commit, close
SessionLocal = sessionmaker(bind=engine)

db = SessionLocal()

if db.get(StudentDB, "S001") is None:
    db.add(StudentDB(id="S001",
                     name="Shubham Bhosale",
                     age=22,
                     course="Python",
                     marks=80,
                     email="shubham@example.com"))
    db.commit()
    
#Read it Back
#query is asking for the table so we give StudentDB and
# .all() allows us to get all rows
for i in db.query(StudentDB).all():
    print(i.id, i.name, i.age, i.marks, i.course, i.email)
    
#Update 
shubham = db.get(StudentDB, "S001")
shubham.marks = 90
db.commit()
print(shubham.marks)