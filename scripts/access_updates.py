"""
@author: Alex Tovar
@email: rosetova@buffalo.edu
@date: 2025-10-16

@description: This script will take a mapping csv file and take the orcid
and update the username to corresponding access username in the User table in moddb.

"""

import configparser
import argparse
import csv
import mysql.connector

XDMOD_CONFIG_PATH = "/data/www/xdmod/etc"


def load_mapping_file(file):
    mapping = {}
    with open(file, mode="r") as file:
        reader = csv.reader(file)
        for row in reader:
            if len(row) == 2:
                orcid, access_username = row
                mapping[orcid.strip()] = access_username.strip()
    return mapping


def update_usernames(cur, mapping):
    for orcid, access_username in mapping.items():
        update_query = """
        UPDATE moddb.User
        SET username = %s
        WHERE username = %s;
        """
        cur.execute(update_query, (access_username, orcid))
        print(f"Updated ORCID {orcid} to username {access_username}")


def main():
    parser = argparse.ArgumentParser(
        description="Update usernames in the User table based on ORCID mapping."
    )
    parser.add_argument(
        "mapping_file",
        help="Path to the CSV file containing ORCID to access username mappings.",
    )
    args = parser.parse_args()
    mapping = load_mapping_file(args.mapping_file)
    if not mapping:
        print("No valid mappings found in the provided file.")
        return

    # Load database configuration
    config = configparser.ConfigParser()
    config.read(f"{XDMOD_CONFIG_PATH}/portal_settings.ini")

    dbconfig = config["datawarehouse"]

    cnx = mysql.connector.connect(
        user=dbconfig["user"].strip('"'),
        password=dbconfig["pass"].strip('"'),
        host="nairr-db-dev-01.ccr.xdmod.org",
        database=dbconfig["database"].strip('"'),
    )

    cursor = cnx.cursor()
    update_usernames(cursor, mapping)
    cnx.commit()
    cursor.close()
    cnx.close()
    print("Username updates completed.")


if __name__ == "__main__":
    main()
