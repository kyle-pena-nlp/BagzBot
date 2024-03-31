import os

def do_it():
    directory = r"C:\git\BagzBot\.wrangler\state\v3\do\protecc-ur-bagz-dev-TokenPairPositionTrackerDO"
    files = [ os.path.join(directory,f) for f in os.listdir(directory) if f.endswith(".sqlite")]
    attachStatements = [ f"ATTACH DATABASE '{file}' AS DB{index};" for (index,file) in enumerate(files) ]
    for attachStatement in attachStatements:
        print(attachStatement)

    selectStatements = [ f"SELECT * FROM DB{index}._cf_KV;" for (index,file) in enumerate(files) ]
    for selectStatement in selectStatements:
        print(selectStatement)

    detachStatements = [ f"DETACH DATABASE DB{index};" for (index,file) in enumerate(files) ]
    for detachStatement in detachStatements:
        print(detachStatement)

if __name__ == "__main__":
    do_it()