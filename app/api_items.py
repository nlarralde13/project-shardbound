from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError
from datetime import datetime
import uuid

from .models import db, Item, ItemInstance, CharacterInventory, Character

api = Blueprint('api', __name__, url_prefix='/api')

def _uid():
    return uuid.uuid4().hex

@api.route('/items', methods=['POST'])
def create_item():
    data = request.get_json(force=True, silent=True) or {}
    required = ['item_id', 'item_version', 'name', 'type', 'rarity', 'stack_size', 'base_stats']
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400

    item = db.session.get(Item, data['item_id'])
    if not item:
        item = Item(
            item_id=data['item_id'],
            item_version=data['item_version'],
            name=data['name'],
            type=data['type'],
            rarity=data['rarity'],
            stack_size=int(data.get('stack_size', 1)),
            base_stats=data.get('base_stats') or {},
        )
        db.session.add(item)
    else:
        item.item_version = data['item_version']
        item.name        = data['name']
        item.type        = data['type']
        item.rarity      = data['rarity']
        item.stack_size  = int(data.get('stack_size', item.stack_size))
        if data.get('base_stats') is not None:
            item.base_stats  = data.get('base_stats')

    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error='Integrity error', detail=str(e)), 400

    return jsonify(message='item created/updated', item_id=item.item_id), 201


@api.route('/item_instances', methods=['POST'])
def create_item_instance():
    data = request.get_json(force=True, silent=True) or {}
    required = ['item_id', 'item_version', 'quantity']
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400

    item = db.session.get(Item, data['item_id'])
    if not item:
        return jsonify(error="Item not found"), 404

    inst = ItemInstance(
        instance_id=_uid(),
        item_id=data['item_id'],
        item_version=data['item_version'],
        quantity=max(1, int(data.get('quantity', 1))),
    )
    db.session.add(inst)
    db.session.commit()
    return jsonify(message='instance created', instance_id=inst.instance_id), 201


@api.route('/game/characters/<character_id>/inventory', methods=['POST'])
def grant_inventory(character_id):
    data = request.get_json(force=True, silent=True) or {}
    required = ['slot_index', 'item_id', 'instance_id', 'qty', 'equipped']
    missing = [k for k in required if k not in data]
    if missing:
        return jsonify(error=f"Missing fields: {', '.join(missing)}"), 400

    char = db.session.get(Character, character_id)
    if not char:
        return jsonify(error='Character not found'), 404

    row = CharacterInventory(
        id=_uid(),
        character_id=character_id,
        slot_index=int(data['slot_index']),
        item_id=data['item_id'],
        instance_id=data['instance_id'],
        qty=max(1, int(data['qty'])),
        equipped=bool(data['equipped']),
        acquired_at=datetime.utcnow(),
    )
    db.session.add(row)
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        return jsonify(error='Integrity error (duplicate slot or FK)', detail=str(e)), 400

    return jsonify(message='granted', id=row.id), 201
